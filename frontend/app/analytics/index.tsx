import { useRouter } from 'expo-router';

import AnalyticsHub from '@/components/analytics/AnalyticsHub';

export default function AnalyticsRoute() {
  const router = useRouter();

  return <AnalyticsHub onBack={() => router.back()} />;
}
