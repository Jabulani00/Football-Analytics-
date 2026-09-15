import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import BhozomaView from '@/components/standings/BhozomaView';
import ImbangiView from '@/components/standings/ImbangiView';
import SubTabBar from '@/components/shared/SubTabBar';
import { useSeasonFixtures } from '@/hooks/useSeasonFixtures';
import type { Competition, StandingRow } from '@/services/oddAlerts';
import type { StandingLike } from '@/utils/motivationEngine';
import { fonts, spacing, theme } from '@/styles/theme';

type PowerView = 'bhozoma' | 'imbangi';

type Props = {
  standings: StandingRow[];
  competitionId: number;
  competitionName: string;
  competitionCountry: string;
  competitionType?: string | null;
  seasonId: number | null;
  seasonName: string;
  seasonProgress?: number | null;
};

function toStandingLike(rows: StandingRow[]): StandingLike[] {
  return rows.map((r) => ({
    rank: r.rank,
    teamId: r.teamId,
    name: r.name,
    points: r.points,
    played: r.played,
    zone: r.zone,
  }));
}

/**
 * Match-level Power dynamics: Bhozoma + Imbangi (moved off league standings).
 */
export default function MatchPowerDynamicsPanel({
  standings,
  competitionId,
  competitionName,
  competitionCountry,
  competitionType,
  seasonId,
  seasonName,
  seasonProgress,
}: Props) {
  const [view, setView] = useState<PowerView>('bhozoma');

  const competition = useMemo((): Competition | null => {
    if (!seasonId) return null;
    return {
      id: competitionId,
      name: competitionName,
      slug: '',
      country: competitionCountry,
      countryId: 0,
      type: competitionType ?? 'League',
      isCup: false,
      currentSeason: seasonId,
      seasons: [
        {
          seasonId,
          seasonName: seasonName || String(seasonId),
          played: null,
          progress: seasonProgress ?? null,
          isCurrent: true,
        },
      ],
    };
  }, [
    competitionId,
    competitionName,
    competitionCountry,
    competitionType,
    seasonId,
    seasonName,
    seasonProgress,
  ]);

  const season = competition?.seasons[0] ?? null;
  const seasonFx = useSeasonFixtures(competition, season, true);
  const like = useMemo(() => toStandingLike(standings), [standings]);

  if (standings.length === 0) {
    return (
      <Text style={styles.muted}>
        Power dynamics need a league table for this competition. Cup ties without a shared table
        won’t show Bhozoma or Imbangi here.
      </Text>
    );
  }

  if (!seasonId) {
    return <Text style={styles.muted}>No season linked to this fixture yet.</Text>;
  }

  return (
    <View>
      <Text style={styles.blurb}>
        How these sides sit in mid-table form (Bhozoma) and against table neighbours (Imbangi),
        based on this competition’s season results.
      </Text>
      <SubTabBar
        tabs={[
          { id: 'bhozoma', label: 'Bhozoma' },
          { id: 'imbangi', label: 'Imbangi' },
        ]}
        active={view}
        onChange={(id) => setView(id as PowerView)}
      />
      {view === 'bhozoma' ? (
        <BhozomaView
          standings={like}
          matches={seasonFx.matches}
          loading={seasonFx.loading}
          error={seasonFx.error}
          competitionId={competitionId}
        />
      ) : (
        <ImbangiView
          standings={like}
          matches={seasonFx.matches}
          loading={seasonFx.loading}
          error={seasonFx.error}
          seasonProgress={seasonProgress}
          competitionName={competitionName}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blurb: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
