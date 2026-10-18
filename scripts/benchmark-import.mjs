// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.cache/import-benchmark');
await build({
  root, configFile: false, logLevel: 'warn',
  build: {
    outDir: output, emptyOutDir: true,
    lib: { entry: path.join(root, 'scripts/import-benchmark.ts'), formats: ['cjs'], fileName: () => 'benchmark.cjs' },
    rollupOptions: { external: (id) => id.startsWith('node:') || id === 'better-sqlite3' },
  },
});

// A fresh process per fixture keeps peak RSS independent of previous corpora/GC.
for (const name of ['repeated-500k', 'varied-500k', 'unique-500k', 'byte-limit']) {
  const result = spawnSync(process.execPath, [path.join(output, 'benchmark.cjs'), name], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
