import json
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from betway_worker import (
    BETWAY_UPCOMING_API_URL,
    IncompleteSnapshotError,
    PersistenceError,
    VerificationError,
    capture_snapshot,
    persist_snapshot,
    verify_removal_candidates,
)


CAPTURED_AT = datetime(2026, 10, 11, 20, 0, tzinfo=timezone.utc)


def event(event_id, *, hours_from_capture=24, **overrides):
    kickoff = CAPTURED_AT + timedelta(hours=hours_from_capture)
    return {
        "eventId": event_id,
        "isActive": True,
        "isFinished": False,
        "isLive": False,
        "shouldDisplay": True,
        "isOutright": False,
        "name": "Alpha FC vs. Bravo United",
        "displayName": "Alpha FC vs. Bravo United",
        "expectedStartEpoch": int(kickoff.timestamp()),
        "homeTeam": "Alpha FC",
        "awayTeam": "Bravo United",
        "league": "Premier League",
        "region": "South Africa",
        **overrides,
    }


def api_page(events, *, final, market_suspended=False, missing_price_for=None):
    markets = []
    outcomes = []
    prices = []
    for fixture in events:
        event_id = fixture["eventId"]
        market_id = f"market-{event_id}"
        markets.append({
            "marketId": market_id,
            "eventId": event_id,
            "marketTypeCName": "win-draw-win",
            "isActive": not market_suspended,
            "isSuspended": market_suspended,
            "shouldDisplay": True,
        })
        for index, (name, price) in enumerate(
            (("Alpha FC", 2.1), ("Draw", 3.2), ("Bravo United", 3.4)),
            start=6,
        ):
            outcome_id = f"{event_id}-{index}"
            outcomes.append({
                "outcomeId": outcome_id,
                "eventId": event_id,
                "marketId": market_id,
                "name": name,
                "displayName": name,
                "index": index,
                "isTradingActive": True,
                "shouldDisplay": True,
            })
            if not (event_id == missing_price_for and name == "Draw"):
                prices.append({
                    "outcomeId": outcome_id,
                    "priceDecimal": price,
                })
    return {
        "events": events,
        "markets": markets,
        "outcomes": outcomes,
        "prices": prices,
        "isFinalPage": final,
    }


class BetwayFixtureTests(unittest.TestCase):
    def capture_one(self, fixture, **page_options):
        page = api_page([fixture], final=True, **page_options)
        snapshot = capture_snapshot(
            fetcher=FakeFetcher([FakeResponse(page)]),
            captured_at=CAPTURED_AT,
        )
        return snapshot.fixtures[0]

    def test_parses_fixture_identity_competition_odds_and_sast_kickoff(self):
        fixture = self.capture_one(event(123))
        self.assertEqual(fixture.provider_event_id, "123")
        self.assertEqual(fixture.home_name, "Alpha FC")
        self.assertEqual(fixture.away_name, "Bravo United")
        self.assertEqual(fixture.competition, "Premier League, South Africa")
        self.assertEqual(
            (fixture.odds_home, fixture.odds_draw, fixture.odds_away),
            (2.1, 3.2, 3.4),
        )
        self.assertTrue(fixture.market_open)
        self.assertFalse(fixture.market_suspended)
        self.assertEqual(fixture.kickoff_timezone, "Africa/Johannesburg")
        self.assertEqual(fixture.kickoff_utc, "2026-10-12T20:00:00+00:00")
        self.assertEqual(fixture.kickoff_label, "2026-10-12 22:00")

    def test_suspended_1x2_market_keeps_the_fixture_and_last_prices(self):
        fixture = self.capture_one(event(123), market_suspended=True)
        self.assertFalse(fixture.market_open)
        self.assertTrue(fixture.market_suspended)
        self.assertEqual(fixture.odds_home, 2.1)

    def test_unavailable_selection_price_does_not_discard_fixture(self):
        fixture = self.capture_one(event(123), missing_price_for=123)
        self.assertEqual(fixture.provider_event_id, "123")
        self.assertIsNone(fixture.odds_draw)
        self.assertFalse(fixture.market_open)
        self.assertFalse(fixture.market_suspended)

    def test_missing_1x2_market_does_not_discard_fixture(self):
        payload = api_page([event(123)], final=True)
        payload["markets"] = []
        payload["outcomes"] = []
        payload["prices"] = []
        snapshot = capture_snapshot(
            fetcher=FakeFetcher([FakeResponse(payload)]),
            captured_at=CAPTURED_AT,
        )
        self.assertEqual(len(snapshot.fixtures), 1)
        self.assertFalse(snapshot.fixtures[0].market_open)
        self.assertFalse(snapshot.fixtures[0].market_suspended)

    def test_live_expired_and_esoccer_events_are_excluded(self):
        fixtures = [
            event(1),
            event(2, hours_from_capture=-1),
            event(3, isLive=True),
            event(4, isFinished=True),
            event(5, region="eSoccer", league="eAdriatic League"),
        ]
        snapshot = capture_snapshot(
            fetcher=FakeFetcher([FakeResponse(api_page(fixtures, final=True))]),
            captured_at=CAPTURED_AT,
        )
        self.assertEqual([fixture.provider_event_id for fixture in snapshot.fixtures], ["1"])
        self.assertEqual(snapshot.source_event_count, 5)
        self.assertEqual(snapshot.excluded_event_count, 4)

    def test_invalid_event_identity_is_rejected(self):
        fixture = event(1)
        payload = api_page([fixture], final=True)
        fixture.pop("eventId")
        payload["events"] = [fixture]
        with self.assertRaisesRegex(IncompleteSnapshotError, "provider event ID"):
            capture_snapshot(
                fetcher=FakeFetcher([FakeResponse(payload)]),
                captured_at=CAPTURED_AT,
            )


class CaptureSafetyTests(unittest.TestCase):
    def test_complete_snapshot_uses_api_terminal_page_marker(self):
        first = api_page([event(1), event(2)], final=False)
        second = api_page([event(3)], final=True)
        fetcher = FakeFetcher([FakeResponse(first), FakeResponse(second)])
        snapshot = capture_snapshot(
            fetcher=fetcher,
            page_size=2,
            captured_at=CAPTURED_AT,
        )
        self.assertTrue(snapshot.complete)
        self.assertEqual(snapshot.pages_captured, 2)
        self.assertEqual(snapshot.source_event_count, 3)
        self.assertEqual(len(snapshot.fixtures), 3)
        self.assertEqual(
            parse_qs(urlparse(fetcher.urls[1]).query)["Skip"],
            ["2"],
        )
        self.assertTrue(fetcher.urls[0].startswith(BETWAY_UPCOMING_API_URL))

    def test_failed_http_response_is_not_a_complete_snapshot(self):
        with self.assertRaisesRegex(IncompleteSnapshotError, "HTTP 503"):
            capture_snapshot(
                fetcher=FakeFetcher([FakeResponse({}, status=503)]),
                captured_at=CAPTURED_AT,
            )

    def test_duplicate_event_id_across_pages_is_rejected(self):
        fetcher = FakeFetcher([
            FakeResponse(api_page([event(1)], final=False)),
            FakeResponse(api_page([event(1)], final=True)),
        ])
        with self.assertRaisesRegex(IncompleteSnapshotError, "Repeated Betway event IDs"):
            capture_snapshot(
                fetcher=fetcher,
                page_size=1,
                captured_at=CAPTURED_AT,
            )

    def test_page_limit_without_final_marker_is_rejected(self):
        with self.assertRaisesRegex(IncompleteSnapshotError, "page limit"):
            capture_snapshot(
                fetcher=FakeFetcher([
                    FakeResponse(api_page([event(1)], final=False))
                ]),
                page_size=1,
                page_limit=1,
                captured_at=CAPTURED_AT,
            )

    def test_complete_empty_listing_is_emitted_for_three_crawl_confirmation(self):
        snapshot = capture_snapshot(
            fetcher=FakeFetcher([FakeResponse(api_page([], final=True))]),
            captured_at=CAPTURED_AT,
        )
        self.assertTrue(snapshot.complete)
        self.assertEqual(snapshot.source_event_count, 0)
        self.assertEqual(snapshot.fixtures, ())

    def test_empty_nonterminal_page_is_rejected(self):
        with self.assertRaisesRegex(IncompleteSnapshotError, "empty page"):
            capture_snapshot(
                fetcher=FakeFetcher([FakeResponse(api_page([], final=False))]),
                captured_at=CAPTURED_AT,
            )

    def test_invalid_terminal_marker_is_rejected(self):
        payload = api_page([event(1)], final=True)
        payload["isFinalPage"] = "true"
        with self.assertRaisesRegex(IncompleteSnapshotError, "terminal-page flag"):
            capture_snapshot(
                fetcher=FakeFetcher([FakeResponse(payload)]),
                captured_at=CAPTURED_AT,
            )

    def test_market_without_identity_fails_the_whole_snapshot(self):
        payload = api_page([event(1)], final=True)
        payload["markets"][0].pop("marketId")
        with self.assertRaisesRegex(IncompleteSnapshotError, "market without identity"):
            capture_snapshot(
                fetcher=FakeFetcher([FakeResponse(payload)]),
                captured_at=CAPTURED_AT,
            )


class PersistenceTests(unittest.TestCase):
    def test_only_complete_snapshot_is_sent_to_service_role_rpc(self):
        snapshot = capture_snapshot(
            fetcher=FakeFetcher([
                FakeResponse(api_page([event(1)], final=True))
            ]),
            captured_at=CAPTURED_AT,
        )
        response = FakeUrlResponse({"status": "complete", "run_id": "run-1"})
        with patch("betway_worker.urlopen", return_value=response) as urlopen_mock:
            result = persist_snapshot(
                snapshot,
                supabase_url="https://project.supabase.co",
                service_role_key="eyJ.service-role",
            )
        self.assertEqual(result["status"], "complete")
        request = urlopen_mock.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://project.supabase.co/rest/v1/rpc/apply_betway_snapshot",
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer eyJ.service-role")
        self.assertEqual(
            json.loads(request.data)["p_snapshot"]["fixtures"][0]["provider_event_id"],
            "1",
        )

    def test_incomplete_snapshot_is_never_persisted(self):
        snapshot = capture_snapshot(
            fetcher=FakeFetcher([
                FakeResponse(api_page([event(1)], final=True))
            ]),
            captured_at=CAPTURED_AT,
        )
        with patch("betway_worker.urlopen") as urlopen_mock:
            with self.assertRaisesRegex(PersistenceError, "incomplete"):
                persist_snapshot(
                    replace(snapshot, complete=False),
                    supabase_url="https://project.supabase.co",
                    service_role_key="service-role-test-key",
                )
        urlopen_mock.assert_not_called()


class StatusVerificationTests(unittest.TestCase):
    def test_claims_calls_protected_verifier_and_resolves_results(self):
        claimed = {
            "candidates": [{
                "episode_id": "episode-1",
                "provider_event_id": "betway-1",
                "home_team": "Alpha",
                "away_team": "Bravo",
                "competition": "League, South Africa",
                "kickoff_utc": "2026-10-12T20:00:00+00:00",
            }],
            "allowed_dates": ["2026-10-11", "2026-10-12", "2026-10-13"],
            "daily_budget_remaining": 77,
        }
        results = [{
            "episode_id": "episode-1",
            "provider_event_id": "betway-1",
            "decision": "verified",
            "source_status": "NS",
            "source_fixture_id": "api-1",
            "source_kickoff_utc": "2026-10-12T20:00:00+00:00",
            "reason": None,
        }]
        resolution = {"processed": 1, "verified": 1, "rejected": 0, "unverified": 0}
        with patch(
            "betway_worker._call_supabase_rpc",
            side_effect=[claimed, resolution],
        ) as rpc:
            with patch(
                "betway_worker.urlopen",
                return_value=FakeUrlResponse({"results": results}),
            ) as urlopen_mock:
                output = verify_removal_candidates(
                    supabase_url="https://project.supabase.co",
                    service_role_key="service-role-key",
                    verifier_url="https://example.vercel.app/betway-status",
                    verifier_token="proxy-token",
                )

        self.assertEqual(output["verified"], 1)
        self.assertEqual(rpc.call_args_list[0].args[0], "claim_betway_status_verifications")
        self.assertEqual(rpc.call_args_list[1].args[0], "resolve_betway_status_verifications")
        request = urlopen_mock.call_args.args[0]
        self.assertEqual(request.full_url, "https://example.vercel.app/betway-status")
        self.assertEqual(request.get_header("Authorization"), "Bearer proxy-token")
        self.assertEqual(
            json.loads(request.data),
            {
                "candidates": claimed["candidates"],
                "allowed_dates": claimed["allowed_dates"],
            },
        )

    def test_no_claimed_candidates_does_not_call_verifier(self):
        with patch(
            "betway_worker._call_supabase_rpc",
            return_value={
                "candidates": [],
                "allowed_dates": [],
                "daily_budget_remaining": 80,
            },
        ):
            with patch("betway_worker.urlopen") as urlopen_mock:
                result = verify_removal_candidates(
                    supabase_url="https://project.supabase.co",
                    service_role_key="service-role-key",
                    verifier_url="https://example.vercel.app/betway-status",
                    verifier_token="proxy-token",
                )
        self.assertEqual(result["claimed"], 0)
        urlopen_mock.assert_not_called()

    def test_verifier_http_failure_does_not_resolve_candidates(self):
        from urllib.error import HTTPError
        import io

        claim = {
            "candidates": [{"episode_id": "episode-1"}],
            "allowed_dates": ["2026-10-12"],
        }
        with patch(
            "betway_worker._call_supabase_rpc",
            side_effect=[claim, {"processed": 1, "unverified": 1}],
        ) as rpc:
            with patch(
                "betway_worker.urlopen",
                side_effect=HTTPError(
                    "https://example.vercel.app/betway-status",
                    503,
                    "unconfigured",
                    {},
                    io.BytesIO(b'{"error":"not configured"}'),
                ),
            ):
                with self.assertRaisesRegex(VerificationError, "HTTP 503"):
                    verify_removal_candidates(
                        supabase_url="https://project.supabase.co",
                        service_role_key="service-role-key",
                        verifier_url="https://example.vercel.app/betway-status",
                        verifier_token="proxy-token",
                    )
        self.assertEqual(rpc.call_count, 2)
        self.assertEqual(
            rpc.call_args_list[1].args[1]["p_results"][0]["reason"],
            "verifier_http_503",
        )


class FakeResponse:
    def __init__(self, body, *, status=200):
        self.body = body
        self.status = status

    def json(self):
        return self.body


class FakeFetcher:
    def __init__(self, responses):
        self.responses = list(responses)
        self.urls = []

    def get(self, url, **_kwargs):
        self.urls.append(url)
        if not self.responses:
            raise AssertionError("Unexpected extra API request")
        return self.responses.pop(0)


class FakeUrlResponse:
    def __init__(self, body):
        self.body = json.dumps(body).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self):
        return self.body


if __name__ == "__main__":
    unittest.main()
