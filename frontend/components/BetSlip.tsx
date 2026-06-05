import FixtureBetSlipSection from '@/components/fixture/FixtureBetSlipSection';
import type { Fixture } from '@/mock/fixturesData';

type BetSlipProps = {
  fixture: Fixture;
};

/** Phase 5 bet-slip generator — wraps fixture slip section. */
export default function BetSlip({ fixture }: BetSlipProps) {
  return <FixtureBetSlipSection fixture={fixture} />;
}
