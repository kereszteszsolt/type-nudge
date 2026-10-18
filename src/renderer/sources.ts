// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { SourceResult } from '../shared/sources';

export function initializeSources(onBusy: (busy: boolean) => void): void {
  const dialog = document.getElementById('sources-dialog') as HTMLDialogElement;
  const open = document.getElementById('sources-button') as HTMLButtonElement;
  const importButton = document.getElementById('import-button') as HTMLButtonElement;
  const list = document.getElementById('sources-list')!;
  const status = document.getElementById('sources-status')!;
  let busy = false;

  function unwrap<T>(result: SourceResult<T>): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  async function refresh(): Promise<void> {
    const sources = unwrap(await window.typeNudge.listSources());
    list.replaceChildren();
    document.getElementById('sources-empty')!.hidden = sources.length !== 0;
    for (const source of sources) {
      const row = document.createElement('li');
      const description = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = source.name;
      const details = document.createElement('span');
      details.textContent = `${source.tokenCount.toLocaleString('en-US')} words · Revision ${source.revision}`;
      description.append(name, details);
      const actions = document.createElement('div');
      actions.className = 'source-actions';
      const label = document.createElement('label');
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = source.enabled;
      enabled.disabled = busy;
      enabled.setAttribute('aria-label', `Use ${source.name} for predictions`);
      enabled.addEventListener('change', () => {
        void run(async () => {
          try { unwrap(await window.typeNudge.setSourceEnabled(source.id, enabled.checked)); }
          catch (error) { enabled.checked = source.enabled; throw error; }
          return `${source.name} ${enabled.checked ? 'enabled' : 'disabled'} for predictions.`;
        });
      });
      label.append(enabled, 'Use');
      actions.append(label);
      for (const [label, operation] of [
        ['Reindex', async () => { unwrap(await window.typeNudge.reindexSource(source.id)); return `${source.name} reindexed from its local copy.`; }],
        ['Delete', async () => { unwrap(await window.typeNudge.deleteSource(source.id)); return `${source.name} deleted from local sources.`; }],
      ] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('aria-label', `${label} ${source.name}`);
        button.disabled = busy;
        button.addEventListener('click', () => { void run(operation); });
        actions.append(button);
      }
      row.append(description, actions);
      list.append(row);
    }
  }
  function setBusy(value: boolean): void {
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    for (const control of dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('#import-button, .source-actions button, .source-actions input')) control.disabled = value;
    importButton.textContent = value ? 'Working…' : 'Import TXT / MD';
    onBusy(value);
  }
  async function run(operation: () => Promise<string>): Promise<void> {
    if (busy) return;
    setBusy(true);
    status.textContent = 'Working with local sources…';
    try {
      const message = await operation();
      await refresh();
      status.textContent = message;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Could not update sources. Please try again.';
    } finally { setBusy(false); }
  }
  open.addEventListener('click', () => {
    dialog.showModal();
    void run(async () => '');
  });
  importButton.addEventListener('click', () => {
    void run(async () => {
      const report = unwrap(await window.typeNudge.importSources());
      if (report.canceled) return 'Import canceled.';
      const summary = `${report.imported} imported · ${report.unchanged} unchanged`;
      return [summary, ...report.errors.map((error) => `${error.name}: ${error.message}`)].join('\n');
    });
  });
}
