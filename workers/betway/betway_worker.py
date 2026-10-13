"""Capture complete, public Betway South Africa pre-match soccer snapshots."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

BETWAY_UPCOMING_URL = "https://www.betway.co.za/sport/soccer/upcoming"
BETWAY_UPCOMING_API_URL = "https://www.betway.co.za/sportsapi/br/v1/BetBook/Upcoming/"
API_HEADERS = {
    "Accept": "application/json",
    "Referer": BETWAY_UPCOMING_URL,
}
MARKET_TYPES = ("[Win/Draw/Win]", "Total Goals", "[Both Teams To Score]")
PAGE_SIZE = 500
PAGE_LIMIT = 40
SOUTH_AFRICA = ZoneInfo("Africa/Johannesburg")


class IncompleteSnapshotError(RuntimeError):
    """Raised when Betway's public listing cannot be proven complete."""


class PersistenceError(RuntimeError):
    """Raised when a complete snapshot cannot be stored durably."""


class VerificationError(RuntimeError):
    """Raised when the protected fixture-status verification cannot complete."""


@dataclass(frozen=True)
class BetwayFixture:
    bookmaker: str
    provider_event_id: str
    home_name: str
    away_name: str
    competition: str | None
    kickoff_label: str
    kickoff_timezone: str
    kickoff_utc: str
    fixture_status: str
    odds_home: float | None
    odds_draw: float | None
    odds_away: float | None
    market_open: bool
    market_suspended: bool


@dataclass(frozen=True)
class BetwaySnapshot:
    bookmaker: str
    source_url: str
    captured_at: str
    complete: bool
    pages_captured: int
    source_event_count: int
    excluded_event_count: int
    fixtures: tuple[BetwayFixture, ...]


def _event_id(event: dict[str, Any]) -> str:
    value = event.get("eventId")
    if isinstance(value, bool) or value is None or not str(value).strip():
        raise IncompleteSnapshotError("Betway event is missing its provider event ID")
    return str(value).strip()


def _is_esports(event: dict[str, Any]) -> bool:
    labels = " ".join(
        str(event.get(key) or "")
        for key in ("region", "league", "displayName", "name")
    ).casefold()
    return any(
        marker in labels
        for marker in (
            "esoccer",
            "e-soccer",
            "esports",
            "e-sports",
            "efootball",
            "e-football",
            "virtual soccer",
            "virtual football",
        )
    )


def _kickoff_from_epoch(value: Any, event_id: str) -> datetime:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise IncompleteSnapshotError(
            f"Betway event {event_id} has no valid scheduled kickoff"
        )
    epoch = float(value)
    if not math.isfinite(epoch) or epoch <= 0:
        raise IncompleteSnapshotError(
            f"Betway event {event_id} has an invalid scheduled kickoff"
        )
    if epoch >= 1_000_000_000_000:
        epoch /= 1000
    try:
        return datetime.fromtimestamp(epoch, timezone.utc)
    except (OverflowError, OSError, ValueError) as error:
        raise IncompleteSnapshotError(
            f"Betway event {event_id} has an out-of-range scheduled kickoff"
        ) from error


def _decimal_price(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        odds = float(value)
    except (TypeError, ValueError):
        return None
    return odds if math.isfinite(odds) and odds >= 1 else None


def _selection_prices(
    *,
    event_id: str,
    home_name: str,
    away_name: str,
    markets: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
    prices: list[dict[str, Any]],
) -> tuple[tuple[float | None, float | None, float | None], bool]:
    candidates = [
        market
        for market in markets
        if str(market.get("eventId")) == event_id
        and str(market.get("marketTypeCName") or "").casefold() == "win-draw-win"
    ]
    if not candidates:
        return (None, None, None), False

    active_candidates = [
        market
        for market in candidates
        if market.get("isActive") is True
        and market.get("isSuspended") is not True
        and market.get("shouldDisplay") is True
    ]
    if len(active_candidates) > 1 or (not active_candidates and len(candidates) > 1):
        raise IncompleteSnapshotError(
            f"Betway event {event_id} has ambiguous 1X2 markets"
        )
    market = active_candidates[0] if active_candidates else candidates[0]
    suspended = (
        market.get("isSuspended") is True
        or market.get("isActive") is not True
        or market.get("shouldDisplay") is not True
    )
    market_id = str(market.get("marketId") or "")
    market_outcomes = [
        outcome
        for outcome in outcomes
        if str(outcome.get("marketId")) == market_id
        and str(outcome.get("eventId")) == event_id
    ]
    if len(market_outcomes) != 3:
        return (None, None, None), suspended

    def label(outcome: dict[str, Any]) -> str:
        return str(outcome.get("displayName") or outcome.get("name") or "").strip().casefold()

    home_key = home_name.strip().casefold()
    away_key = away_name.strip().casefold()
    by_name: dict[str, dict[str, Any]] = {}
    for outcome in market_outcomes:
        outcome_label = label(outcome)
        if outcome_label == home_key:
            by_name["home"] = outcome
        elif outcome_label == away_key:
            by_name["away"] = outcome
        elif outcome_label in {"draw", "the draw", "x"}:
            by_name["draw"] = outcome

    if len(by_name) == 3:
        ordered = (by_name["home"], by_name["draw"], by_name["away"])
    else:
        try:
            ordered = tuple(
                sorted(market_outcomes, key=lambda outcome: int(outcome["index"]))
            )
        except (KeyError, TypeError, ValueError):
            return (None, None, None), suspended

    price_by_outcome: dict[str, Any] = {}
    for price in prices:
        outcome_id = price.get("outcomeId")
        if outcome_id is not None:
            price_by_outcome[str(outcome_id)] = price.get("priceDecimal")
    decimal_prices = tuple(
        _decimal_price(price_by_outcome.get(str(outcome.get("outcomeId"))))
        if outcome.get("isTradingActive") is True
        and outcome.get("shouldDisplay") is True
        else None
        for outcome in ordered
    )
    return (
        decimal_prices[0],
        decimal_prices[1],
        decimal_prices[2],
    ), suspended


def _parse_fixture(
    event: dict[str, Any],
    *,
    markets: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
    prices: list[dict[str, Any]],
    captured_at: datetime,
) -> BetwayFixture | None:
    event_id = _event_id(event)
    if _is_esports(event) or event.get("isOutright") is True:
        return None

    kickoff = _kickoff_from_epoch(event.get("expectedStartEpoch"), event_id)
    if not isinstance(event.get("isLive"), bool) or not isinstance(
        event.get("isFinished"), bool
    ):
        raise IncompleteSnapshotError(
            f"Betway event {event_id} is missing lifecycle flags"
        )
    if event["isLive"] or event["isFinished"] or kickoff <= captured_at:
        return None

    home_name = str(event.get("homeTeam") or "").strip()
    away_name = str(event.get("awayTeam") or "").strip()
    if not home_name or not away_name:
        raise IncompleteSnapshotError(
            f"Betway event {event_id} is missing a team name"
        )
    if not isinstance(event.get("isActive"), bool) or not isinstance(
        event.get("shouldDisplay"), bool
    ):
        raise IncompleteSnapshotError(
            f"Betway event {event_id} is missing offer-status flags"
        )

    fixture_status = (
        "suspended"
        if not event["isActive"] or not event["shouldDisplay"]
        else "active"
    )
    odds, market_suspended = _selection_prices(
        event_id=event_id,
        home_name=home_name,
        away_name=away_name,
        markets=markets,
        outcomes=outcomes,
        prices=prices,
    )
    local_kickoff = kickoff.astimezone(SOUTH_AFRICA)
    league = str(event.get("league") or "").strip()
    region = str(event.get("region") or "").strip()
    competition = ", ".join(part for part in (league, region) if part) or None
    market_open = fixture_status == "active" and not market_suspended and all(
        price is not None for price in odds
    )
    return BetwayFixture(
        bookmaker="Betway",
        provider_event_id=event_id,
        home_name=home_name,
        away_name=away_name,
        competition=competition,
        kickoff_label=local_kickoff.strftime("%Y-%m-%d %H:%M"),
        kickoff_timezone="Africa/Johannesburg",
        kickoff_utc=kickoff.isoformat(),
        fixture_status=fixture_status,
        odds_home=odds[0],
        odds_draw=odds[1],
        odds_away=odds[2],
        market_open=market_open,
        market_suspended=market_suspended,
    )


def _request_url(base_url: str, *, skip: int, take: int) -> str:
    query = [
        ("countryCode", "ZA"),
        ("sportId", "soccer"),
        ("Skip", str(skip)),
        ("Take", str(take)),
        ("cultureCode", "en-US"),
        ("isEsport", "false"),
        ("boostedOnly", "false"),
        *((("marketTypes", market_type) for market_type in MARKET_TYPES)),
    ]
    return f"{base_url}?{urlencode(query)}"


def _validate_page(body: Any, skip: int) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise IncompleteSnapshotError(
            f"Betway API returned an invalid page at offset {skip}"
        )
    for field in ("events", "markets", "outcomes", "prices"):
        rows = body.get(field)
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise IncompleteSnapshotError(
                f"Betway API page at offset {skip} has an invalid {field} list"
            )
    if any(
        row.get("marketId") is None or row.get("eventId") is None
        for row in body["markets"]
    ):
        raise IncompleteSnapshotError(
            f"Betway API page at offset {skip} has a market without identity"
        )
    if any(
        row.get("outcomeId") is None
        or row.get("marketId") is None
        or row.get("eventId") is None
        for row in body["outcomes"]
    ):
        raise IncompleteSnapshotError(
            f"Betway API page at offset {skip} has an outcome without identity"
        )
    if any(row.get("outcomeId") is None for row in body["prices"]):
        raise IncompleteSnapshotError(
            f"Betway API page at offset {skip} has a price without identity"
        )
    if not isinstance(body.get("isFinalPage"), bool):
        raise IncompleteSnapshotError(
            f"Betway API page at offset {skip} has no terminal-page flag"
        )
    return body


def capture_snapshot(
    *,
    url: str = BETWAY_UPCOMING_API_URL,
    page_size: int = PAGE_SIZE,
    page_limit: int = PAGE_LIMIT,
    fetcher: Any = None,
    captured_at: datetime | None = None,
) -> BetwaySnapshot:
    """Capture all API pages and reject incomplete or unstable event sets."""
    if not 1 <= page_size <= PAGE_SIZE:
        raise ValueError(f"page_size must be between 1 and {PAGE_SIZE}")
    if page_limit < 1:
        raise ValueError("page_limit must be positive")
    if fetcher is None:
        from scrapling.fetchers import Fetcher

        fetcher = Fetcher

    captured_at = captured_at or datetime.now(timezone.utc)
    if captured_at.tzinfo is None or captured_at.utcoffset() is None:
        raise ValueError("captured_at must include a timezone")

    fixtures: list[BetwayFixture] = []
    seen_ids: set[str] = set()
    pages_captured = 0
    source_event_count = 0
    excluded_event_count = 0

    for page_number in range(page_limit):
        skip = source_event_count
        request_url = _request_url(url, skip=skip, take=page_size)
        try:
            response = fetcher.get(
                request_url,
                headers=API_HEADERS,
                timeout=45,
            )
        except Exception as error:
            raise IncompleteSnapshotError(
                f"Betway API request failed at offset {skip}: {error}"
            ) from error
        if response.status != 200:
            raise IncompleteSnapshotError(
                f"Betway API returned HTTP {response.status} at offset {skip}"
            )
        try:
            body = _validate_page(response.json(), skip)
        except IncompleteSnapshotError:
            raise
        except Exception as error:
            raise IncompleteSnapshotError(
                f"Betway API response was not valid JSON at offset {skip}: {error}"
            ) from error

        page_events = body["events"]
        page_ids = [_event_id(event) for event in page_events]
        duplicates = seen_ids.intersection(page_ids)
        if duplicates or len(page_ids) != len(set(page_ids)):
            repeated = sorted(
                duplicates
                | {event_id for event_id in page_ids if page_ids.count(event_id) > 1}
            )
            raise IncompleteSnapshotError(
                f"Repeated Betway event IDs at offset {skip}: {', '.join(repeated)}"
            )
        if not page_events and (
            page_number != 0 or body["isFinalPage"] is not True
        ):
            raise IncompleteSnapshotError(
                f"Betway API returned an empty page at offset {skip}; "
                "refusing to infer removals"
            )

        for event in page_events:
            fixture = _parse_fixture(
                event,
                markets=body["markets"],
                outcomes=body["outcomes"],
                prices=body["prices"],
                captured_at=captured_at,
            )
            if fixture is None:
                excluded_event_count += 1
            else:
                fixtures.append(fixture)

        seen_ids.update(page_ids)
        source_event_count += len(page_events)
        pages_captured += 1
        if body["isFinalPage"]:
            break
        if not page_events:
            raise IncompleteSnapshotError(
                f"Betway API pagination stalled at offset {skip}"
            )
    else:
        raise IncompleteSnapshotError(
            f"Betway page limit {page_limit} reached before the final page"
        )

    if not fixtures and source_event_count:
        raise IncompleteSnapshotError(
            "Betway API completed without any eligible pre-match soccer fixtures"
        )
    return BetwaySnapshot(
        bookmaker="Betway",
        source_url=url,
        captured_at=captured_at.isoformat(),
        complete=True,
        pages_captured=pages_captured,
        source_event_count=source_event_count,
        excluded_event_count=excluded_event_count,
        fixtures=tuple(fixtures),
    )


def snapshot_json(snapshot: BetwaySnapshot) -> str:
    return json.dumps(asdict(snapshot), indent=2, ensure_ascii=False)


def persist_snapshot(
    snapshot: BetwaySnapshot,
    *,
    supabase_url: str | None = None,
    service_role_key: str | None = None,
) -> dict[str, Any]:
    """Persist only a proven complete snapshot through the service-only RPC."""
    url = (supabase_url or os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (service_role_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise PersistenceError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to persist"
        )
    if not snapshot.complete:
        raise PersistenceError("Refusing to persist an incomplete snapshot")

    result = _call_supabase_rpc(
        "apply_betway_snapshot",
        {"p_snapshot": asdict(snapshot)},
        url=url,
        key=key,
    )
    if not isinstance(result, dict) or result.get("status") != "complete":
        raise PersistenceError(
            "Betway persistence RPC returned an unexpected result"
        )
    return result


def record_failed_crawl(
    error_message: str,
    *,
    supabase_url: str | None = None,
    service_role_key: str | None = None,
) -> str:
    url = (supabase_url or os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (service_role_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise PersistenceError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to record failure"
        )
    result = _call_supabase_rpc(
        "record_betway_crawl_failure",
        {"p_error": error_message},
        url=url,
        key=key,
    )
    if not isinstance(result, str):
        raise PersistenceError("Betway failure logger returned an unexpected result")
    return result


def verify_removal_candidates(
    *,
    supabase_url: str | None = None,
    service_role_key: str | None = None,
    verifier_url: str | None = None,
    verifier_token: str | None = None,
) -> dict[str, Any]:
    """Claim a bounded verification batch, query the protected verifier, and resolve it."""
    url = (supabase_url or os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (service_role_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise VerificationError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for verification"
        )

    endpoint = (verifier_url or os.getenv("BETWAY_STATUS_PROXY_URL") or "").strip()
    token = (verifier_token or os.getenv("BETWAY_STATUS_PROXY_TOKEN") or "").strip()
    if not endpoint.startswith("https://") or not token:
        raise VerificationError(
            "BETWAY_STATUS_PROXY_URL must be an HTTPS Vercel endpoint and "
            "BETWAY_STATUS_PROXY_TOKEN must be configured"
        )

    claimed = _call_supabase_rpc(
        "claim_betway_status_verifications",
        {"p_limit": 5},
        url=url,
        key=key,
    )
    if not isinstance(claimed, dict):
        raise VerificationError("Betway verification claim returned an unexpected result")
    candidates = claimed.get("candidates")
    allowed_dates = claimed.get("allowed_dates")
    if not isinstance(candidates, list) or not isinstance(allowed_dates, list):
        raise VerificationError("Betway verification claim is missing candidates or dates")
    if not candidates:
        return {
            "claimed": 0,
            "resolved": 0,
            "daily_budget_remaining": claimed.get("daily_budget_remaining"),
            "reason": claimed.get("reason"),
        }

    request = Request(
        endpoint,
        data=json.dumps({
            "candidates": candidates,
            "allowed_dates": allowed_dates,
        }).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=45) as response:
            body = json.loads(response.read())
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        _record_unverified_candidates(
            candidates,
            reason=f"verifier_http_{error.code}",
            url=url,
            key=key,
        )
        raise VerificationError(
            f"Betway status verifier failed with HTTP {error.code}: {response_body[:500]}"
        ) from error
    except (URLError, TimeoutError) as error:
        _record_unverified_candidates(
            candidates,
            reason="verifier_network_error",
            url=url,
            key=key,
        )
        raise VerificationError(f"Betway status verifier request failed: {error}") from error
    except json.JSONDecodeError as error:
        _record_unverified_candidates(
            candidates,
            reason="verifier_invalid_json",
            url=url,
            key=key,
        )
        raise VerificationError("Betway status verifier returned invalid JSON") from error

    results = body.get("results") if isinstance(body, dict) else None
    expected_episode_ids = {
        candidate["episode_id"]
        for candidate in candidates
        if isinstance(candidate, dict) and isinstance(candidate.get("episode_id"), str)
    }
    invalid_results = not isinstance(results, list) or len(results) != len(candidates)
    if not invalid_results:
        invalid_results = any(
            not isinstance(result, dict)
            or not isinstance(result.get("episode_id"), str)
            for result in results
        )
    if not invalid_results:
        returned_episode_ids = [result["episode_id"] for result in results]
        invalid_results = (
            len(set(returned_episode_ids)) != len(results)
            or set(returned_episode_ids) != expected_episode_ids
        )
    if invalid_results:
        _record_unverified_candidates(
            candidates,
            reason="invalid_verifier_response",
            url=url,
            key=key,
        )
        raise VerificationError(
            "Betway status verifier returned an unexpected number of results"
        )

    resolution = _call_supabase_rpc(
        "resolve_betway_status_verifications",
        {"p_results": results},
        url=url,
        key=key,
    )
    if (
        not isinstance(resolution, dict)
        or resolution.get("processed") != len(candidates)
    ):
        raise VerificationError("Betway verification resolution returned an unexpected result")
    return {
        "claimed": len(candidates),
        **resolution,
        "daily_budget_remaining": claimed.get("daily_budget_remaining"),
    }


def _record_unverified_candidates(
    candidates: list[dict[str, Any]],
    *,
    reason: str,
    url: str,
    key: str,
) -> None:
    results = [
        {
            "episode_id": candidate["episode_id"],
            "decision": "unverified",
            "reason": reason,
        }
        for candidate in candidates
    ]
    resolution = _call_supabase_rpc(
        "resolve_betway_status_verifications",
        {"p_results": results},
        url=url,
        key=key,
    )
    if (
        not isinstance(resolution, dict)
        or resolution.get("processed") != len(candidates)
    ):
        raise VerificationError("Could not record the failed verifier attempt")


def _call_supabase_rpc(
    function_name: str,
    payload: dict[str, Any],
    *,
    url: str,
    key: str,
) -> Any:
    headers = {
        "apikey": key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    request = Request(
        f"{url}/rest/v1/rpc/{function_name}",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read())
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise PersistenceError(
            f"Supabase RPC {function_name} failed with HTTP {error.code}: {body[:500]}"
        ) from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise PersistenceError(
            f"Supabase RPC {function_name} failed: {error}"
        ) from error
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        help="Write the completed snapshot to this path instead of stdout.",
    )
    parser.add_argument(
        "--persist",
        action="store_true",
        help="Store the complete snapshot through Supabase using configured secrets.",
    )
    args = parser.parse_args()
    try:
        snapshot = capture_snapshot()
    except IncompleteSnapshotError as error:
        if args.persist:
            try:
                record_failed_crawl(str(error))
            except PersistenceError as persistence_error:
                print(
                    f"Betway capture failed: {error}; "
                    f"failure logging also failed: {persistence_error}",
                    file=sys.stderr,
                )
                return 1
        print(f"Betway snapshot not complete: {error}", file=sys.stderr)
        return 1

    try:
        if args.persist:
            result = persist_snapshot(snapshot)
            result["status_verification"] = verify_removal_candidates()
            output = json.dumps(result, indent=2)
        else:
            output = snapshot_json(snapshot)
    except (PersistenceError, VerificationError) as error:
        print(f"Betway snapshot persistence/verification failed: {error}", file=sys.stderr)
        return 1

    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
