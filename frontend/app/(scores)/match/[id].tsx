import { useLocalSearchParams, useRouter } from 'expo-router';

import MatchDetailScreen from '@/components/match-detail/MatchDetailScreen';

export default function MatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <MatchDetailScreen
      matchId={id ?? ''}
      onBack={() => (router.canGoBack() ? router.back() : router.push('/'))}
    />
  );
}
