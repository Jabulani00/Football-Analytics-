import { useLocalSearchParams, useRouter } from 'expo-router';

import MatchScreen from '@/components/match/MatchScreen';
import { getLeagueIdFromMatchId, mockFixtures } from '@/mock/fixturesData';

export function generateStaticParams() {
  const params: { id: string }[] = [];
  for (const fixtures of Object.values(mockFixtures)) {
    for (const fixture of fixtures) {
      params.push({ id: fixture.id });
    }
  }
  return params;
}

export default function MatchRoute() {
  const { id, leagueId } = useLocalSearchParams<{ id: string; leagueId?: string }>();
  const router = useRouter();
  const resolvedLeagueId = leagueId ?? getLeagueIdFromMatchId(id ?? '');

  return (
    <MatchScreen
      matchId={id ?? ''}
      leagueId={resolvedLeagueId}
      onBack={() =>
        router.push({ pathname: '/league/[id]', params: { id: resolvedLeagueId } })
      }
    />
  );
}
