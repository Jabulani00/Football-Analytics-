import { useRouter } from 'expo-router';

import StatBoardScreen from '@/components/stat-board/StatBoardScreen';

export default function StatsOrdinaryRoute() {
  const router = useRouter();
  return (
    <StatBoardScreen
      mode="ordinary"
      kicker="Team tables"
      title="Stats ordinary"
      blurb="Scoring, conceding, results, and goal lines from finished scores. The timing columns stay blank unless the season feed already measured them."
      onBack={() => router.push('/')}
    />
  );
}
