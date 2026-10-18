// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { NgramOrder, PredictionCandidate } from '../../shared/prediction';
export type { NgramOrder, PredictionRequest, PredictionCandidate, PredictionResult } from '../../shared/prediction';

export interface PredictionSnapshot {
  readonly indexRevision: number;
  readonly sourceFingerprint: string;
  readonly activeSourceIds: readonly string[];
  select(order: NgramOrder, contextKey: string, prefix: string, limit: number): readonly PredictionCandidate[];
}

export interface PredictionRepository {
  // Revision, enabled flags and ranked rows must belong to one read snapshot.
  read<T>(sourceIds: readonly string[], operation: (snapshot: PredictionSnapshot) => T): T;
}
