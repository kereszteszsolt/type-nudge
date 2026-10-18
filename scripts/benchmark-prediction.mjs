// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.cache/prediction-benchmark');
await build({
  root,
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: output,
    emptyOutDir: true,
    lib: { entry: path.join(root, 'scripts/prediction-benchmark.ts'), formats: ['cjs'], fileName: () => 'benchmark.cjs' },
    rollupOptions: { external: (id) => id.startsWith('node:') || id === 'better-sqlite3' },
  },
});
const result = spawnSync(process.execPath, [path.join(output, 'benchmark.cjs')], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
