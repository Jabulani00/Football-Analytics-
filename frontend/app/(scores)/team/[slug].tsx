import { useLocalSearchParams, useRouter } from 'expo-router';

import TeamUpcomingScreen from '@/components/match-detail/TeamUpcomingScreen';

export default function TeamRoute() {
  const { slug, name } = useLocalSearchParams<{ slug: string; name?: string }>();
  const router = useRouter();

  return (
    <TeamUpcomingScreen
      teamId={slug ?? ''}
      teamName={name ?? 'Team'}
      onBack={() => (router.canGoBack() ? router.back() : router.push('/'))}
    />
  );
}
