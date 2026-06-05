import type { ModelScaler } from '@/types/data';

/** Lazy load — avoids pulling ML scaler when only stats/evidence are needed. */
export function getBttsScaler(): ModelScaler {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/assets/models/btts/scaler.json') as ModelScaler;
}
