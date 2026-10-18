// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { SourceStore } from './store';
import type { PersonalStore } from './personal';
import type { IndexProgress } from '../../shared/sources';

type AsyncMethods<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => R | Promise<Awaited<R>> : never };
export type StoreAccess = AsyncMethods<Pick<SourceStore,
  'list' | 'storageUsage' | 'checkFiles' | 'importFiles' | 'reindex' | 'delete' | 'clearUnavailable' | 'setEnabled' |
  'getPredictionSettings' | 'setPredictionSettings' | 'predict'>> & {
    personal: AsyncMethods<PersonalStore>;
    progress?: () => IndexProgress;
  };
