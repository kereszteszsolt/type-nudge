// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { PredictionSettings, SourceMode, NgramOrder } from '../shared/prediction';
import type { SourceResult, SourceSummary } from '../shared/sources';
import { createSuggestions } from './suggestions';

export function unwrap<T>(result: SourceResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function initializePrediction(): {
  extension: ReturnType<typeof createSuggestions>['extension'];
  sourcesBusy: (busy: boolean) => void;
  start: () => void;
} {
  const mode = document.getElementById('prediction-source') as HTMLSelectElement;
  const toggles = [...document.querySelectorAll<HTMLInputElement>('input[name="ngram"]')];
  const status = document.getElementById('prediction-status')!;
  let settings: PredictionSettings = { sourceMode: 'imported', enabledN: [1, 2, 3] };
  let sources: SourceSummary[] = [];
  let sourceBusy = false;
  let saving = false;
  let generation = 0;
  let ready = false;
  let message = '';
  function setStatus(text: string): void {
    if (status.textContent !== text) status.textContent = text;
  }
  const suggestions = createSuggestions(async (input) => unwrap(await window.typeNudge.predict(input)), (failed) => {
    setStatus(failed ? 'Suggestions unavailable. Keep writing or change a setting to retry.' : message);
  });
  function render(): void {
    const busy = sourceBusy || saving;
    mode.value = settings.sourceMode;
    mode.disabled = busy || !ready;
    for (const toggle of toggles) {
      toggle.checked = settings.enabledN.includes(Number(toggle.value) as NgramOrder);
      toggle.disabled = busy || !ready || (toggle.checked && settings.enabledN.length === 1);
    }
    const count = sources.filter((source) => source.enabled && source.tokenCount > 0).length;
    message = settings.sourceMode === 'personal' ? 'My Writing has no learned text yet. Saving and learning arrive in a later update.'
      : count === 0 ? 'No active corpus. Import text in Sources and enable at least one nonempty source.'
        : `${count} active imported ${count === 1 ? 'source' : 'sources'} · Tab accepts · Alt+Down cycles · Esc dismisses`;
    setStatus(busy ? 'Updating local suggestions… You can keep writing.' : message);
    suggestions.refresh(ready && !busy && settings.sourceMode !== 'personal' && count > 0);
  }
  async function reload(): Promise<void> {
    const current = ++generation;
    suggestions.refresh(false);
    try {
      const [preferences, imported] = await Promise.all([window.typeNudge.getPredictionSettings(), window.typeNudge.listSources()]);
      if (current !== generation) return;
      settings = unwrap(preferences);
      sources = unwrap(imported);
      ready = true;
      render();
    } catch {
      if (current !== generation) return;
      ready = false;
      render();
      setStatus('Could not load prediction settings. Reopen Sources to retry; editing is available.');
    }
  }
  async function save(): Promise<void> {
    const next: PredictionSettings = { sourceMode: mode.value as SourceMode,
      enabledN: toggles.filter((toggle) => toggle.checked).map((toggle) => Number(toggle.value) as NgramOrder) };
    if (sourceBusy || saving || !ready || !next.enabledN.length) { render(); return; }
    saving = true;
    ++generation;
    render();
    let error = false;
    try { settings = unwrap(await window.typeNudge.setPredictionSettings(next)); }
    catch { error = true; }
    finally {
      saving = false;
      render();
      if (error) setStatus('Could not save prediction settings. Your previous choices are still active.');
    }
  }
  mode.addEventListener('change', () => { void save(); });
  for (const toggle of toggles) toggle.addEventListener('change', () => { void save(); });
  return {
    extension: suggestions.extension,
    start() { void reload(); },
    sourcesBusy(value) {
      sourceBusy = value;
      ++generation;
      render();
      if (!value) void reload();
    },
  };
}
