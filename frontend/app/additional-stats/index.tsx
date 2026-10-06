import { useRouter } from 'expo-router';

import AdditionalStatsScreen from '@/components/additional-stats/AdditionalStatsScreen';

export default function AdditionalStatsRoute() {
  const router = useRouter();
  return <AdditionalStatsScreen onBack={() => router.push('/')} />;
}
