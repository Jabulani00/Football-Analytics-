"""Async OddAlerts API client (requires `httpx`).

Auth is a query param `api_token=<ODDALERTS_TOKEN>` (matches the app's native
transport). Endpoints verified in docs/ODDALERTS_API_DATA_CATALOG.md.

Only the reads the prediction engine needs are implemented:
  - upcoming fixtures
  - fixture detail with include=probability,odds,h2h
  - season stats (team aggregates)
  - fixtures between (results window for baseline + form)
"""

from __future__ import annotations

import os
import time
from typing import Any

try:
    import httpx
except ImportError as exc:  # pragma: no cover - import guard
    raise ImportError(
        "oddalerts_client needs httpx. Install with: pip install -r requirements.txt"
    ) from exc

BASE_URL = os.environ.get("ODDALERTS_BASE_URL", "https://data.oddalerts.com/api")
DEFAULT_TIMEOUT = 20.0


class OddAlertsError(RuntimeError):
    pass


class OddAlertsClient:
    def __init__(
        self,
        token: str | None = None,
        base_url: str = BASE_URL,
        verify: bool | str = True,
    ) -> None:
        """`verify` maps to httpx's TLS verification: True (default), a path to a
        CA bundle (for corporate TLS-intercepting proxies), or False to disable
        (dev only — never in production). Env override: ODDALERTS_CA_BUNDLE."""
        self.token = token or os.environ.get("ODDALERTS_TOKEN", "")
        if not self.token:
            raise OddAlertsError("ODDALERTS_TOKEN is not set (env or constructor arg).")
        self.base_url = base_url.rstrip("/")
        ca_bundle = os.environ.get("ODDALERTS_CA_BUNDLE")
        if ca_bundle:
            verify = ca_bundle
        self._client = httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT,
            headers={"Accept": "application/json"},
            verify=verify,
        )

    async def __aenter__(self) -> "OddAlertsClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        query = dict(params or {})
        query["api_token"] = self.token
        url = f"{self.base_url}/{path.lstrip('/')}"
        resp = await self._client.get(url, params=query)
        if resp.status_code == 429:
            raise OddAlertsError("Rate limited (429). Back off and retry.")
        resp.raise_for_status()
        return resp.json()

    async def _get_all_pages(
        self, path: str, params: dict[str, Any] | None = None, max_pages: int = 10
    ) -> list[dict[str, Any]]:
        """Follow the paginated {info, data} envelope up to max_pages."""
        out: list[dict[str, Any]] = []
        page = 1
        while page <= max_pages:
            payload = await self._get(path, {**(params or {}), "page": page})
            data = payload.get("data") or []
            out.extend(data)
            info = payload.get("info") or {}
            if not info.get("next_page_url"):
                break
            page += 1
        return out

    # --- Endpoints -----------------------------------------------------------
    async def upcoming_fixtures(
        self, days: int = 3, competitions: str | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"days": days}
        if competitions:
            params["competitions"] = competitions
        return await self._get_all_pages("fixtures/upcoming", params)

    async def fixture_detail(
        self, fixture_id: int, include: str = "probability,odds,h2h"
    ) -> dict[str, Any]:
        payload = await self._get(f"fixtures/{fixture_id}", {"include": include})
        data = payload.get("data", payload)
        # Detail may come back as a single object or a one-element list.
        if isinstance(data, list):
            return data[0] if data else {}
        return data

    async def season_stats(self, season_id: int) -> list[dict[str, Any]]:
        return await self._get_all_pages(f"stats/season/{season_id}", {})

    async def fixtures_between(
        self, from_unix: int, to_unix: int, teams: int | str | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"from": from_unix, "to": to_unix}
        if teams is not None:
            params["teams"] = teams
        return await self._get_all_pages("fixtures/between", params)


def season_window_unix(season_name: str, now: int | None = None) -> tuple[int, int]:
    """Rough unix [from, to] for a season string like '2025/2026' or '2025'.

    Mirrors frontend seasonWindowUnix: a European season starts ~August of the
    first year and ends ~July of the next.
    """
    import calendar
    import datetime as _dt

    now = now or int(time.time())
    first = season_name.split("/")[0].strip()
    try:
        start_year = int(first)
    except ValueError:
        # Unknown format → last 300 days.
        return now - 300 * 86400, now

    start = _dt.datetime(start_year, 8, 1, tzinfo=_dt.timezone.utc)
    end = _dt.datetime(start_year + 1, 7, 31, tzinfo=_dt.timezone.utc)
    from_unix = calendar.timegm(start.timetuple())
    to_unix = min(now, calendar.timegm(end.timetuple()))
    return from_unix, to_unix
