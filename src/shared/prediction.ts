// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { SourceResult } from './sources';

export type NgramOrder = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type NgramScales = readonly [number, number, number, number, number, number, number];
export const defaultNgramScales: NgramScales = Object.freeze([1, 1, 1, 1, 1, 1, 1]);
export type SourceMode = 'imported' | 'personal' | 'combined';
export interface PredictionSettings {
  sourceMode: SourceMode;
  maxN: NgramOrder;
  poolSize: number;
  previewWords: number;
  acceptWords: number;
  ngramScales: NgramScales;
}
export const defaultPredictionSettings: Readonly<PredictionSettings> = Object.freeze({
  sourceMode: 'imported', maxN: 3, poolSize: 10, previewWords: 3, acceptWords: 2, ngramScales: defaultNgramScales,
});
export interface PredictionInput {
  readonly prefix: string;
  // At most six completed words in the current sentence, oldest first.
  readonly context: readonly string[];
  readonly avoidWord?: string;
}
export interface PredictionRequest extends PredictionInput {
  readonly sourceIds: readonly string[];
  readonly maxN: NgramOrder;
  readonly poolSize: number;
  readonly previewWords: number;
  readonly ngramScales: NgramScales;
}
export interface PredictionCandidate {
  readonly word: string;
  readonly display: string;
  // Virtual cross-order score after per-N scaling and both top-X cutoffs.
  readonly frequency: number;
}
export interface PredictionResult {
  readonly candidates: readonly PredictionCandidate[];
  readonly words: readonly PredictionCandidate[];
  readonly indexRevision: number;
}
export const predictionChannels = {
  predict: 'prediction:query', settings: 'prediction:settings', configure: 'prediction:configure',
} as const;
export interface PredictionBridge {
  predict(input: PredictionInput): Promise<SourceResult<PredictionResult>>;
  getPredictionSettings(): Promise<SourceResult<PredictionSettings>>;
  setPredictionSettings(settings: PredictionSettings): Promise<SourceResult<PredictionSettings>>;
}
export function boundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
export function validateNgramScales(value: unknown): NgramScales {
  if (!Array.isArray(value) || value.length !== 7 ||
      Array.from(value).some((scale) => !boundedInteger(scale, 0, 250))) {
    throw new Error('Choose seven N-gram multipliers between 0 and 250.');
  }
  return Object.freeze([...value]) as NgramScales;
}
export function validatePredictionSettings(input: unknown): PredictionSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Prediction settings are required.');
  const value = input as Record<string, unknown>;
  const keys = Object.keys(defaultPredictionSettings);
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)) ||
      !['imported', 'personal', 'combined'].includes(value.sourceMode as string) ||
      !boundedInteger(value.maxN, 1, 7) || !boundedInteger(value.poolSize, 1, 100) ||
      !boundedInteger(value.previewWords, 1, 10) || !boundedInteger(value.acceptWords, 1, value.previewWords)) {
    throw new Error('Choose N=1–7, pool size 1–100, preview 1–10 and an acceptance count within the preview.');
  }
  return { sourceMode: value.sourceMode as SourceMode, maxN: value.maxN as NgramOrder,
    poolSize: value.poolSize, previewWords: value.previewWords, acceptWords: value.acceptWords,
    ngramScales: validateNgramScales(value.ngramScales) };
}
