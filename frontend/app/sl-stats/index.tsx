import { useRouter } from 'expo-router';

import SlStatsScreen from '@/components/sl-stats/SlStatsScreen';

export default function SlStatsRoute() {
  const router = useRouter();
  return <SlStatsScreen onBack={() => router.push('/')} />;
}
