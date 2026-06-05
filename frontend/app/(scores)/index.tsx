import { useRouter } from 'expo-router';

import LiveScoresFeed from '@/components/home/LiveScoresFeed';

export default function Index() {
  const router = useRouter();

  return (
    <LiveScoresFeed
      onLeaguePress={(leagueId) => {
        router.push({ pathname: '/league/[id]', params: { id: leagueId } });
      }}
      onMatchPress={(matchId, leagueId) => {
        router.push({
          pathname: '/match/[id]',
          params: { id: matchId, leagueId },
        });
      }}
    />
  );
}
