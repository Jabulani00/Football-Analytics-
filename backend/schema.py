"""Scoreline SQLite schema — 72 tables (45 base + 27 last-N)."""

from __future__ import annotations

ORDINARY_STATS = [
    "sc_pct",
    "conc_pct",
    "sc_avg",
    "conc_avg",
    "btts_yes",
    "btts_no",
    "cs_pct",
    "avg_goals",
    "fts_pct",
    "w_pct",
    "d_pct",
    "l_pct",
    "over05",
    "over15",
    "over25",
    "over35",
    "over45",
    "under05",
    "under15",
    "under25",
    "under35",
    "under45",
    "scoring_05",
    "conceding_05",
    "scoring_15",
    "conceding_15",
    "scoring_25",
    "conceding_25",
    "scored_first",
    "handicap",
    "early_goals_1h",
    "early_goals_2h",
    "early_goals_conceded",
    "late_goals",
]

PERIODS = ("ft", "ht", "2h")
SPLITS = ("overall", "home", "away")
LAST_N = ("last10", "last8", "last6")

# 45 base = 5 stat families × 9 period/split combos
STAT_FAMILIES = ("ordinary", "ppg", "series", "ft_only", "league_avg")


#: Traffic-light cut-offs. Keep in step with ``COMPLIANCE_THRESHOLDS`` in
#: ``frontend/utils/compliance.ts`` — the frontend builds the same rows live and
#: the two must colour a value identically.
SIGNAL_GREEN = 65
SIGNAL_YELLOW = 45


def stat_signal(value: float) -> str:
    """How often a stat lands: >=65 green, 45-64 yellow, <45 red.

    Green means *reliable*, not *good* — a high "fails to score" is still green.
    """
    if value >= SIGNAL_GREEN:
        return "green"
    if value >= SIGNAL_YELLOW:
        return "yellow"
    return "red"


def base_table_names() -> list[str]:
    names: list[str] = []
    for family in STAT_FAMILIES:
        for period in PERIODS:
            for split in SPLITS:
                names.append(f"{family}_{period}_{split}")
    return names


def last_n_table_names() -> list[str]:
    names: list[str] = []
    for window in LAST_N:
        for period in PERIODS:
            for split in SPLITS:
                names.append(f"{window}_{period}_{split}")
    return names


def all_table_names() -> list[str]:
    return base_table_names() + last_n_table_names()


def create_table_sql(table_name: str) -> str:
    cols = [
        "id INTEGER PRIMARY KEY AUTOINCREMENT",
        "team_name TEXT NOT NULL",
        "league_id TEXT NOT NULL",
        "season TEXT NOT NULL DEFAULT '2024/25'",
    ]
    for stat in ORDINARY_STATS:
        cols.append(f"{stat} REAL")
        cols.append(f"{stat}_signal TEXT")
    cols.append("UNIQUE(team_name, league_id, season)")
    body = ",\n  ".join(cols)
    return f"CREATE TABLE IF NOT EXISTS {table_name} (\n  {body}\n);"


def row_insert_sql(table_name: str) -> str:
    stat_cols = []
    for stat in ORDINARY_STATS:
        stat_cols.extend([stat, f"{stat}_signal"])
    placeholders = ", ".join(["?"] * (3 + len(stat_cols)))
    col_list = "team_name, league_id, season, " + ", ".join(stat_cols)
    return f"INSERT OR REPLACE INTO {table_name} ({col_list}) VALUES ({placeholders});"
