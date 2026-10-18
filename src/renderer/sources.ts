// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { importLimits, type SourceResult } from '../shared/sources';

export function initializeSources(onBusy: (busy: boolean) => void): void {
  const dialog = document.getElementById('sources-dialog') as HTMLDialogElement;
  const open = document.getElementById('sources-button') as HTMLButtonElement;
  const importButton = document.getElementById('import-button') as HTMLButtonElement;
  const refreshButton = document.getElementById('refresh-sources') as HTMLButtonElement;
  const list = document.getElementById('sources-list')!;
  const status = document.getElementById('sources-status')!;
  let busy = false;
  document.getElementById('import-limits')!.textContent = `Import UTF-8 TXT or Markdown files. Up to ${importLimits.files} files, ${importLimits.fileBytes / 1024 ** 2} MiB each, ${importLimits.batchBytes / 1024 ** 2} MiB per selection, ${importLimits.tokens.toLocaleString('en-US')} words per file.`;

  function unwrap<T>(result: SourceResult<T>): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  async function refresh(): Promise<void> {
    const sources = unwrap(await window.typeNudge.checkSourceFiles());
    list.replaceChildren();
    document.getElementById('sources-empty')!.hidden = sources.length !== 0;
    for (const source of sources) {
      const row = document.createElement('li');
      const description = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = source.name;
      const details = document.createElement('span');
      details.textContent = `${source.tokenCount.toLocaleString('en-US')} words · Revision ${source.revision} · ${source.indexMaxN < 7 ? 'N=4–7 pending · Reindex local copy' : 'N=1–7 ready'}`;
      const availability = document.createElement('span');
      availability.textContent = {
        available: 'Original file available', missing: 'Original file missing',
        unavailable: 'Original file unavailable', unknown: 'File availability unknown · Reimport to remember its location, or check again',
      }[source.fileStatus];
      description.append(name, details, availability);
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
      const canClear = source.hasIndex && (source.fileStatus === 'missing' || source.fileStatus === 'unavailable');
      for (const [label, operation] of [
        ['Reindex', async () => { unwrap(await window.typeNudge.reindexSource(source.id)); return `${source.name} reindexed from its local copy.`; }],
        [canClear ? 'Clear index' : 'Delete', async () => {
          unwrap(await (canClear ? window.typeNudge.clearUnavailableSource(source.id) : window.typeNudge.deleteSource(source.id)));
          return `${source.name} and its stored text/index deleted from local sources.`;
        }],
      ] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('aria-label', `${label} ${source.name}`);
        if (canClear && label === 'Clear index') button.title = 'Remove this source, its stored text and all indexed word counts from this device.';
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
    for (const control of dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>('#import-button, #refresh-sources, .source-actions button, .source-actions input')) control.disabled = value;
    importButton.textContent = value ? 'Working…' : 'Import TXT / MD';
    onBusy(value);
  }
  async function run(operation: () => Promise<string>): Promise<void> {
    if (busy) return;
    setBusy(true);
    status.textContent = 'Working with local sources…';
    const progress = setInterval(() => {
      void window.typeNudge.getIndexProgress().then((result) => {
        if (busy && result.ok && result.value.active) status.textContent = `Indexing N=1–7 · ${result.value.words.toLocaleString('en-US')} words… You can close this panel and keep writing.`;
      }).catch(() => {});
    }, 250);
    try {
      const message = await operation();
      await refresh();
      status.textContent = message;
    } catch (error) {
      try { await refresh(); } catch { /* Preserve the original operation error. */ }
      status.textContent = error instanceof Error ? error.message : 'Could not update sources. Please try again.';
    } finally { clearInterval(progress); setBusy(false); }
  }
  open.addEventListener('click', () => {
    dialog.showModal();
    void run(async () => '');
  });
  refreshButton.addEventListener('click', () => { void run(async () => 'File availability checked.'); });
  importButton.addEventListener('click', () => {
    void run(async () => {
      const report = unwrap(await window.typeNudge.importSources());
      if (report.canceled) return 'Import canceled.';
      const summary = `${report.imported} imported · ${report.unchanged} unchanged`;
      return [summary, ...report.errors.map((error) => `${error.name}: ${error.message}`)].join('\n');
    });
  });
}
