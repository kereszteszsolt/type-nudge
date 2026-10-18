// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { SourceResult } from './sources';

export type NgramOrder = 1 | 2 | 3;
export type SourceMode = 'imported' | 'personal' | 'combined';
export interface PredictionSettings {
  sourceMode: SourceMode;
  enabledN: NgramOrder[];
}
export interface PredictionInput {
  readonly prefix: string;
  // Completed words in the current sentence, oldest first. Never a document body.
  readonly context: readonly string[];
}
export interface PredictionRequest extends PredictionInput {
  readonly sourceIds: readonly string[];
  readonly enabledN: readonly NgramOrder[];
}
export interface PredictionCandidate {
  readonly word: string;
  readonly display: string;
  readonly frequency: number;
}
export interface PredictionResult {
  readonly candidates: readonly PredictionCandidate[];
  readonly order: NgramOrder | null;
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

export function validatePredictionSettings(input: unknown): PredictionSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Prediction settings are required.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || Object.keys(value).some((key) => !['sourceMode', 'enabledN'].includes(key)) ||
      !['imported', 'personal', 'combined'].includes(value.sourceMode as string) ||
      !Array.isArray(value.enabledN) || value.enabledN.length < 1 || value.enabledN.length > 3 ||
      value.enabledN.some((n) => n !== 1 && n !== 2 && n !== 3) || new Set(value.enabledN).size !== value.enabledN.length) {
    throw new Error('Choose a prediction source and at least one of N=1, N=2 or N=3.');
  }
  return { sourceMode: value.sourceMode as SourceMode, enabledN: [...value.enabledN].sort() as NgramOrder[] };
}
