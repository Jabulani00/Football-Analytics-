"""Populate all 72 tables with deterministic mock stats + colour signals."""

from __future__ import annotations

import math
import sqlite3

from create_db import LEAGUE_TEAMS, create_database
from paths import DB_PATH
from schema import ORDINARY_STATS, all_table_names, row_insert_sql, stat_signal

STAT_BASE: dict[str, float] = {
    "sc_pct": 55,
    "conc_pct": 52,
    "sc_avg": 48,
    "conc_avg": 45,
    "btts_yes": 58,
    "btts_no": 42,
    "cs_pct": 35,
    "avg_goals": 50,
    "fts_pct": 22,
    "w_pct": 45,
    "d_pct": 28,
    "l_pct": 27,
    "over05": 92,
    "over15": 72,
    "over25": 52,
    "over35": 28,
    "over45": 12,
    "under05": 8,
    "under15": 28,
    "under25": 48,
    "under35": 72,
    "under45": 88,
    "scoring_05": 78,
    "conceding_05": 75,
    "scoring_15": 42,
    "conceding_15": 40,
    "scoring_25": 18,
    "conceding_25": 16,
    "scored_first": 52,
    "handicap": 48,
    "early_goals_1h": 38,
    "early_goals_2h": 44,
    "early_goals_conceded": 36,
    "late_goals": 41,
}


def _hash(s: str) -> int:
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h


def _clamp(n: float, lo: float = 5.0, hi: float = 95.0) -> float:
    return max(lo, min(hi, n))


def team_modifier(team: str, league_id: str) -> float:
    return (_hash(team + league_id) % 30) - 15


def table_modifier(table_name: str) -> float:
    if table_name.startswith("last10"):
        return 4
    if table_name.startswith("last8"):
        return 7
    if table_name.startswith("last6"):
        return 11
    if "_ht_" in table_name:
        return -8
    if "_2h_" in table_name:
        return 5
    if "_home" in table_name:
        return 6
    if "_away" in table_name:
        return -4
    return 0


def stat_value(stat: str, team: str, league_id: str, table_name: str) -> float:
    base = STAT_BASE[stat]
    mod = team_modifier(team, league_id) + table_modifier(table_name)
    jitter = math.sin(_hash(stat + team + table_name) * 0.17) * 6
    if stat.endswith("_avg") or stat == "handicap":
        return round(_clamp(base + mod + jitter, 10, 90), 1)
    return round(_clamp(base + mod + jitter))


def populate_stats(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    for table in all_table_names():
        insert_sql = row_insert_sql(table)
        for league_id, teams in LEAGUE_TEAMS.items():
            for team in teams:
                values: list[object] = [team, league_id, "2024/25"]
                for stat in ORDINARY_STATS:
                    val = stat_value(stat, team, league_id, table)
                    values.append(val)
                    values.append(stat_signal(val))
                cur.execute(insert_sql, values)
    conn.commit()
    print(f"Populated stats for {len(all_table_names())} tables")


def main() -> None:
    if not DB_PATH.exists():
        conn = create_database()
    else:
        conn = sqlite3.connect(DB_PATH)
    populate_stats(conn)
    conn.close()


if __name__ == "__main__":
    main()
