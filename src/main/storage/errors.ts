// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

export class SourceError extends Error {}

export function sourceErrorMessage(error: unknown): string {
  return error instanceof SourceError ? error.message : 'Could not update local sources. Please try again.';
}
