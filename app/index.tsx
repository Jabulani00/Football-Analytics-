import { useRouter } from 'expo-router';

import HomeScreen from '@/components/home/HomeScreen';

export default function Index() {
  const router = useRouter();

  return (
    <HomeScreen
      onLeaguePress={(leagueId) => {
        router.push({ pathname: '/league/[id]', params: { id: leagueId } });
      }}
    />
  );
}
