// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

export type NgramOrder = 1 | 2 | 3;

export interface PredictionRequest {
  readonly prefix: string;
  // Completed words from the current sentence/document only, oldest first.
  readonly context: readonly string[];
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

export interface PredictionSnapshot {
  readonly indexRevision: number;
  readonly sourceFingerprint: string;
  readonly activeSourceIds: readonly string[];
  select(order: NgramOrder, contextKey: string, prefix: string): readonly PredictionCandidate[];
}

export interface PredictionRepository {
  // Revision, enabled flags and ranked rows must belong to one read snapshot.
  read<T>(sourceIds: readonly string[], operation: (snapshot: PredictionSnapshot) => T): T;
}
