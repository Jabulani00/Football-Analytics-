import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getBttsScaler } from '@/data/scalerLoader';
import { useStatValue } from '@/hooks/useStats';
import { getLeagueIdFromMatchId } from '@/mock/fixturesData';
import type { ModelScaler } from '@/types/data';

export type MarketId = 'btts' | 'over25' | 'over15' | 'cs' | 'fts' | 'ht_over05';

export type PredictionResult = {
  market: MarketId;
  probability: number;
  label: string;
  source: 'tfjs' | 'scaler' | 'heuristic';
};

type FeatureVector = {
  home_btts_pct: number;
  home_over25_pct: number;
  home_cs_pct: number;
  home_ppg: number;
  home_avg_goals: number;
  away_btts_pct: number;
  away_over25_pct: number;
  away_cs_pct: number;
  away_ppg: number;
  away_avg_goals: number;
};

let tfModule: typeof import('@tensorflow/tfjs') | null = null;
let bttsModel: import('@tensorflow/tfjs').LayersModel | null = null;
let modelLoadAttempted = false;

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function scaleFeatures(raw: number[], scaler: ModelScaler): number[] {
  return raw.map((v, i) => (v - scaler.mean[i]) / (scaler.std[i] || 1));
}

function predictWithScaler(scaler: ModelScaler, features: number[]): number {
  const scaled = scaleFeatures(features, scaler);
  const logit = scaled.reduce((sum, v, i) => sum + v * scaler.weights[i], scaler.bias);
  return sigmoid(logit);
}

function buildFeatures(
  homeTeam: string,
  awayTeam: string,
  leagueId: string,
  getStat: (team: string, key: string) => number,
): FeatureVector {
  return {
    home_btts_pct: getStat(homeTeam, 'btts_yes'),
    home_over25_pct: getStat(homeTeam, 'over25'),
    home_cs_pct: getStat(homeTeam, 'cs_pct'),
    home_ppg: getStat(homeTeam, 'w_pct') / 33,
    home_avg_goals: getStat(homeTeam, 'avg_goals') / 20,
    away_btts_pct: getStat(awayTeam, 'btts_yes'),
    away_over25_pct: getStat(awayTeam, 'over25'),
    away_cs_pct: getStat(awayTeam, 'cs_pct'),
    away_ppg: getStat(awayTeam, 'w_pct') / 33,
    away_avg_goals: getStat(awayTeam, 'avg_goals') / 20,
  };
}

async function loadBttsModel() {
  if (modelLoadAttempted) return bttsModel;
  modelLoadAttempted = true;
  if (Platform.OS !== 'web') return null;

  try {
    tfModule = await import('@tensorflow/tfjs');
    await tfModule.ready();
    bttsModel = await tfModule.loadLayersModel('/assets/models/btts/model.json');
    return bttsModel;
  } catch {
    return null;
  }
}

export function useModel(fixtureId: string, homeTeam: string, awayTeam: string) {
  const leagueId = getLeagueIdFromMatchId(fixtureId);
  const tableId = 'ordinary_ft_overall';
  const [modelReady, setModelReady] = useState(false);
  const scaler = getBttsScaler();

  const homeBtts = useStatValue(tableId, homeTeam, leagueId, 'btts_yes');
  const homeOver25 = useStatValue(tableId, homeTeam, leagueId, 'over25');
  const homeCs = useStatValue(tableId, homeTeam, leagueId, 'cs_pct');
  const homeW = useStatValue(tableId, homeTeam, leagueId, 'w_pct');
  const homeAvg = useStatValue(tableId, homeTeam, leagueId, 'avg_goals');
  const awayBtts = useStatValue(tableId, awayTeam, leagueId, 'btts_yes');
  const awayOver25 = useStatValue(tableId, awayTeam, leagueId, 'over25');
  const awayCs = useStatValue(tableId, awayTeam, leagueId, 'cs_pct');
  const awayW = useStatValue(tableId, awayTeam, leagueId, 'w_pct');
  const awayAvg = useStatValue(tableId, awayTeam, leagueId, 'avg_goals');

  useEffect(() => {
    loadBttsModel().then((m) => setModelReady(!!m));
  }, []);

  const getStat = useCallback(
    (team: string, key: string) => {
      const map: Record<string, number | null> = {
        btts_yes: team === homeTeam ? homeBtts.value : awayBtts.value,
        over25: team === homeTeam ? homeOver25.value : awayOver25.value,
        cs_pct: team === homeTeam ? homeCs.value : awayCs.value,
        w_pct: team === homeTeam ? homeW.value : awayW.value,
        avg_goals: team === homeTeam ? homeAvg.value : awayAvg.value,
      };
      return map[key] ?? 50;
    },
    [homeTeam, homeBtts, homeOver25, homeCs, homeW, homeAvg, awayBtts, awayOver25, awayCs, awayW, awayAvg],
  );

  const predictBTTS = useCallback(async (): Promise<PredictionResult> => {
    const fv = buildFeatures(homeTeam, awayTeam, leagueId, getStat);
    const featureArray = Object.values(fv);

    if (modelReady && bttsModel && tfModule) {
      const input = tfModule.tensor2d([featureArray]);
      const output = bttsModel.predict(input) as import('@tensorflow/tfjs').Tensor;
      const prob = (await output.data())[0];
      input.dispose();
      output.dispose();
      return { market: 'btts', probability: prob, label: 'BTTS Yes', source: 'tfjs' };
    }

    if (scaler) {
      const prob = predictWithScaler(scaler, featureArray);
      return { market: 'btts', probability: prob, label: 'BTTS Yes', source: 'scaler' };
    }

    const heuristic = sigmoid(
      0.04 * (fv.home_btts_pct + fv.away_btts_pct) + 0.03 * (fv.home_over25_pct + fv.away_over25_pct) - 5,
    );
    return { market: 'btts', probability: heuristic, label: 'BTTS Yes', source: 'heuristic' };
  }, [homeTeam, awayTeam, leagueId, getStat, modelReady, scaler]);

  const predictOver25 = useCallback((): PredictionResult => {
    const fv = buildFeatures(homeTeam, awayTeam, leagueId, getStat);
    const prob = sigmoid(0.05 * (fv.home_over25_pct + fv.away_over25_pct) + 0.02 * (fv.home_avg_goals + fv.away_avg_goals) - 4);
    return { market: 'over25', probability: prob, label: 'Over 2.5', source: 'heuristic' };
  }, [homeTeam, awayTeam, leagueId, getStat]);

  const predictions = [
    { market: 'btts' as const, label: 'BTTS Yes', sync: false },
    { market: 'over25' as const, label: 'Over 2.5', sync: true },
  ];

  return {
    predictBTTS,
    predictOver25,
    predictions,
    modelReady,
    scalerLoaded: !!scaler,
  };
}
