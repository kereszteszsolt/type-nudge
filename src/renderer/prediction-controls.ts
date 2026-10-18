// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { PredictionSettings, SourceMode, NgramOrder } from '../shared/prediction';
import type { SourceResult, SourceSummary } from '../shared/sources';
import { createSuggestions } from './suggestions';
import type { PersonalState } from '../shared/documents';

export function unwrap<T>(result: SourceResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function initializePrediction(): {
  extension: ReturnType<typeof createSuggestions>['extension'];
  sourcesBusy: (busy: boolean) => void;
  documentsBusy: (busy: boolean) => void;
  start: () => void;
} {
  const mode = document.getElementById('prediction-source') as HTMLSelectElement;
  const toggles = [...document.querySelectorAll<HTMLInputElement>('input[name="ngram"]')];
  const status = document.getElementById('prediction-status')!;
  let settings: PredictionSettings = { sourceMode: 'imported', enabledN: [1, 2, 3] };
  let sources: SourceSummary[] = [];
  const pending = new Set<string>();
  let personal: PersonalState = { learning: false, documents: [] };
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
    const busy = pending.size > 0 || saving;
    mode.value = settings.sourceMode;
    mode.disabled = busy || !ready;
    for (const toggle of toggles) {
      toggle.checked = settings.enabledN.includes(Number(toggle.value) as NgramOrder);
      toggle.disabled = busy || !ready || (toggle.checked && settings.enabledN.length === 1);
    }
    const importedCount = settings.sourceMode === 'personal' ? 0 : sources.filter((source) => source.enabled && source.tokenCount > 0).length;
    const personalCount = settings.sourceMode === 'imported' || !personal.learning ? 0
      : personal.documents.filter((doc) => doc.enabled && doc.learned && doc.tokenCount > 0).length;
    const count = importedCount + personalCount;
    const corpus = personalCount ? `${importedCount} imported · ${personalCount} personal sources` : `${count} active imported ${count === 1 ? 'source' : 'sources'}`;
    message = count > 0 ? `${corpus} · Tab accepts · Alt+Down cycles · Esc dismisses`
      : settings.sourceMode === 'personal' ? 'My Writing has no active learned text. Enable learning in Documents, then save a document.'
        : 'No active corpus. Import text in Sources, or enable learning in Documents and save your writing.';
    setStatus(busy ? 'Updating local suggestions… You can keep writing.' : message);
    suggestions.refresh(ready && !busy && count > 0);
  }
  async function reload(): Promise<void> {
    const current = ++generation;
    suggestions.refresh(false);
    try {
      const [preferences, imported, writing] = await Promise.all([window.typeNudge.getPredictionSettings(), window.typeNudge.listSources(), window.typeNudge.listDocuments()]);
      if (current !== generation) return;
      settings = unwrap(preferences);
      sources = unwrap(imported);
      personal = unwrap(writing);
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
    if (pending.size || saving || !ready || !next.enabledN.length) { render(); return; }
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
  function externalBusy(owner: string, value: boolean): void {
      if (value) pending.add(owner); else pending.delete(owner);
      ++generation;
      render();
      if (!value) void reload();
  }
  return {
    extension: suggestions.extension,
    start() { void reload(); },
    sourcesBusy: (value) => externalBusy('sources', value),
    documentsBusy: (value) => externalBusy('documents', value),
  };
}
