// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { importLimits } from '../../shared/sources';
import { completeWord, normalizeWord, partialWord } from '../text/words';
import type { NgramOrder, PredictionRequest } from './types';

function word(value: unknown, partial: boolean): string {
  const message = partial ? 'Invalid word prefix.' : 'Context must contain completed words from one sentence.';
  if (typeof value !== 'string' || value.length > importLimits.wordCodePoints * 2) throw new Error(message);
  const normalized = value.normalize('NFC');
  if ([...normalized].length > importLimits.wordCodePoints ||
      (!(partial && normalized === '') && !(partial ? partialWord : completeWord).test(normalized))) throw new Error(message);
  return normalizeWord(normalized);
}

export function normalizePredictionRequest(input: unknown): PredictionRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A prediction request is required.');
  const request = input as Record<string, unknown>;
  if (Object.keys(request).some((key) => !['prefix', 'context', 'sourceIds', 'enabledN'].includes(key))) throw new Error('Unknown prediction request field.');
  if (!Array.isArray(request.context) || request.context.length > 2) throw new Error('Provide at most two completed context words.');
  if (!Array.isArray(request.sourceIds) || request.sourceIds.length > importLimits.sources ||
      request.sourceIds.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error('Provide at most 100 valid source IDs.');
  }
  if (!Array.isArray(request.enabledN) || request.enabledN.length < 1 || request.enabledN.length > 3 ||
      request.enabledN.some((n) => n !== 1 && n !== 2 && n !== 3)) throw new Error('Enable at least one of N=1, N=2 or N=3.');
  return {
    prefix: word(request.prefix, true),
    context: request.context.map((token) => word(token, false)),
    sourceIds: [...new Set(request.sourceIds.map((id: string) => id.toLowerCase()))].sort(),
    enabledN: [...new Set(request.enabledN as NgramOrder[])].sort((a, b) => b - a),
  };
}
