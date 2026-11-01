import { useCallback, useState } from 'react';
import { Linking, Platform, Share } from 'react-native';

import {
  BETWAY_SOCCER_URL,
  buildBetwayTransferSummary,
  validateBetwaySlip,
  type BetwaySlipLeg,
} from '@/services/betwayBetSlip';

export type BetwayExportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; priceChanges: number }
  | { status: 'error'; message: string };

/** Validate, copy and open Betway without submitting credentials, a stake or a bet. */
export function useBetwayExport() {
  const [state, setState] = useState<BetwayExportState>({ status: 'idle' });

  const exportSlip = useCallback(async (legs: BetwaySlipLeg[]) => {
    if (legs.length === 0) {
      setState({ status: 'error', message: 'Add at least one live Betway selection.' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const result = await validateBetwaySlip(legs);
      if (result.unavailable.length > 0) {
        const details = result.unavailable.map(({ leg, reason }) => `${leg.fixture}: ${reason}`).join('; ');
        setState({ status: 'error', message: `Betway slip not copied. ${details}. Remove or replace unavailable legs.` });
        return;
      }
      const message = buildBetwayTransferSummary(result.valid);
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        await Share.share({ title: 'Scoreline Betway selections', message });
      }
      const priceChanges = result.valid.filter((leg) => leg.priceChanged).length;
      setState({ status: 'done', priceChanges });
      if (Platform.OS === 'web') window.open(BETWAY_SOCCER_URL, '_blank', 'noopener,noreferrer');
      else await Linking.openURL(BETWAY_SOCCER_URL);
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not prepare the Betway slip.' });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);
  return { state, exportSlip, reset };
}
