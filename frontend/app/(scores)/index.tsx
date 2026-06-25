import { useScoresFilter } from '@/components/layout/ScoresFilterContext';
import LiveScoresFeed from '@/components/home/LiveScoresFeed';
import StandingsPanel from '@/components/standings/StandingsPanel';

export default function Index() {
  const { panelMode, selectedCompetition } = useScoresFilter();

  if (panelMode === 'standings' && selectedCompetition) {
    return <StandingsPanel />;
  }
  return <LiveScoresFeed />;
}
