"""Create scoreline.db with all 72 statistical tables."""

from __future__ import annotations

import sqlite3

from paths import DB_PATH
from schema import all_table_names, create_table_sql

# Teams seeded per league (matches mock/fixturesData.ts)
LEAGUE_TEAMS: dict[str, list[str]] = {
    "spl": [
        "Celtic",
        "Rangers",
        "Hearts",
        "Aberdeen",
        "Hibernian",
        "Kilmarnock",
        "St Mirren",
        "Motherwell",
        "Dundee",
        "Ross County",
        "St Johnstone",
    ],
    "epl": [
        "Arsenal",
        "Chelsea",
        "Liverpool",
        "Manchester City",
        "Manchester United",
        "Tottenham",
        "Newcastle",
        "Aston Villa",
        "Brighton",
        "West Ham",
        "Brentford",
        "Crystal Palace",
        "Everton",
        "Fulham",
        "Wolves",
        "Bournemouth",
        "Nottingham Forest",
        "Leicester",
        "Ipswich",
        "Southampton",
    ],
    "laliga": [
        "Real Madrid",
        "Barcelona",
        "Atlético Madrid",
        "Sevilla",
        "Real Betis",
        "Villarreal",
        "Real Sociedad",
        "Athletic Club",
        "Valencia",
        "Girona",
    ],
    "bundesliga": [
        "Bayern Munich",
        "Borussia Dortmund",
        "Bayer Leverkusen",
        "RB Leipzig",
        "Eintracht Frankfurt",
        "VfB Stuttgart",
        "Wolfsburg",
        "Freiburg",
        "Hoffenheim",
        "Union Berlin",
        "Augsburg",
        "Werder Bremen",
        "Mainz",
        "Bochum",
        "Heidenheim",
        "St Pauli",
        "Holstein Kiel",
        "Gladbach",
    ],
    "seriea": [
        "Inter Milan",
        "AC Milan",
        "Juventus",
        "Napoli",
        "Atalanta",
        "Roma",
        "Lazio",
        "Fiorentina",
        "Bologna",
        "Torino",
        "Udinese",
        "Empoli",
        "Cagliari",
        "Parma",
        "Monza",
        "Como",
    ],
    "ligue1": [
        "Paris Saint-Germain",
        "Monaco",
        "Marseille",
        "Lyon",
        "Lille",
        "Nice",
        "Lens",
        "Rennes",
        "Strasbourg",
        "Toulouse",
        "Brest",
        "Reims",
        "Nantes",
        "Montpellier",
    ],
    "eredivisie": [
        "PSV",
        "Ajax",
        "Feyenoord",
        "AZ Alkmaar",
        "Twente",
        "Utrecht",
        "Heerenveen",
        "Groningen",
        "NEC",
        "Go Ahead Eagles",
    ],
    "ucl": [
        "Real Madrid",
        "Bayern Munich",
        "Manchester City",
        "Paris Saint-Germain",
        "Barcelona",
        "Arsenal",
        "Inter Milan",
        "Borussia Dortmund",
        "Atlético Madrid",
        "Liverpool",
    ],
}


def create_database(db_path: Path = DB_PATH) -> sqlite3.Connection:
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          league_id TEXT NOT NULL,
          season TEXT NOT NULL DEFAULT '2024/25',
          UNIQUE(name, league_id, season)
        );
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS fixtures (
          id TEXT PRIMARY KEY,
          league_id TEXT NOT NULL,
          date TEXT NOT NULL,
          kickoff TEXT NOT NULL,
          status TEXT NOT NULL,
          home_team TEXT NOT NULL,
          away_team TEXT NOT NULL,
          home_score INTEGER,
          away_score INTEGER
        );
        """
    )

    for table in all_table_names():
        cur.execute(create_table_sql(table))

    for league_id, teams in LEAGUE_TEAMS.items():
        for team in teams:
            cur.execute(
                "INSERT OR IGNORE INTO teams (name, league_id) VALUES (?, ?);",
                (team, league_id),
            )

    conn.commit()
    print(f"Created {len(all_table_names())} stat tables in {db_path}")
    return conn


if __name__ == "__main__":
    create_database()
