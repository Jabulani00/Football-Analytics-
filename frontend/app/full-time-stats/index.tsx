import { useRouter } from 'expo-router';

import StatBoardScreen from '@/components/stat-board/StatBoardScreen';

export default function FullTimeStatsRoute() {
  const router = useRouter();
  return (
    <StatBoardScreen
      mode="ft"
      kicker="Half patterns"
      title="Full-time only"
      blurb="Both-halves patterns, HT/FT results, and the 1st-half and 2nd-half goal lines. Pick a group to change the catalogue."
      onBack={() => router.push('/')}
    />
  );
}
