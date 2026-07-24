import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { bookingUrl, createShareABet, type ShareLeg } from '@/services/hollywoodbets';

export type ExportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; code: number; url: string }
  | { status: 'error'; message: string };

/**
 * Turns a set of Hollywoodbets Share-A-Bet legs into a booking code and opens
 * the pre-loaded betslip. This creates a RESERVATION only — the punter reviews
 * and pays on Hollywoodbets; no bet is placed here.
 */
export function useHollywoodExport(punterId = 0) {
  const [state, setState] = useState<ExportState>({ status: 'idle' });

  const open = useCallback((url: string) => {
    if (Platform.OS === 'web') {
      // New tab so the app state is preserved.
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url).catch(() => undefined);
    }
  }, []);

  const exportSlip = useCallback(
    async (legs: ShareLeg[]) => {
      if (legs.length === 0) {
        setState({ status: 'error', message: 'Add at least one selection.' });
        return;
      }
      setState({ status: 'loading' });
      try {
        const { code, url } = await createShareABet(legs, punterId);
        setState({ status: 'done', code, url });
        open(url);
      } catch (e: unknown) {
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    },
    [open, punterId],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, exportSlip, reset, bookingUrl };
}
