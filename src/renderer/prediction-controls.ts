// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { defaultPredictionSettings, validateNgramScales, type PredictionSettings, type SourceMode, type NgramOrder } from '../shared/prediction';
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
  const maxN = document.getElementById('maximum-n') as HTMLInputElement;
  const pool = document.getElementById('pool-size') as HTMLInputElement;
  const preview = document.getElementById('preview-words') as HTMLInputElement;
  const accept = document.getElementById('accept-words') as HTMLInputElement;
  const scales = Array.from({ length: 7 }, (_, i) => ({
    slider: document.getElementById(`ngram-scale-${i + 1}`) as HTMLInputElement,
    number: document.getElementById(`ngram-scale-value-${i + 1}`) as HTMLInputElement,
  }));
  const storageStatus = document.getElementById('storage-usage')!;
  const storageRefresh = document.getElementById('refresh-storage') as HTMLButtonElement;
  let measuring = false;
  function formatBytes(bytes: number): string {
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    const unit = bytes ? Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024))) : 0;
    return `${(bytes / 1024 ** unit).toFixed(unit ? 2 : 0)} ${units[unit]}`;
  }
  async function refreshStorage(): Promise<void> {
    if (measuring) return;
    measuring = true;
    storageRefresh.disabled = true;
    storageStatus.setAttribute('aria-busy', 'true');
    try {
      const usage = unwrap(await window.typeNudge.getStorageUsage());
      storageStatus.textContent = `Database storage: ${formatBytes(usage.totalBytes)} total · Database ${formatBytes(usage.databaseBytes)} · WAL ${formatBytes(usage.walBytes)} · SHM ${formatBytes(usage.shmBytes)}`;
      storageStatus.title = `${usage.totalBytes.toLocaleString()} bytes total (${usage.databaseBytes.toLocaleString()} database + ${usage.walBytes.toLocaleString()} WAL + ${usage.shmBytes.toLocaleString()} SHM).`;
    } catch {
      storageStatus.textContent = 'Database size unavailable. Use Refresh size to retry.';
      storageStatus.removeAttribute('title');
    } finally {
      measuring = false;
      storageRefresh.disabled = false;
      storageStatus.removeAttribute('aria-busy');
    }
  }
  storageRefresh.addEventListener('click', () => { void refreshStorage(); });
  for (const name of ['settings', 'help']) {
    const dialog = document.getElementById(`${name}-dialog`) as HTMLDialogElement;
    const button = document.getElementById(`${name}-button`) as HTMLButtonElement;
    button.addEventListener('click', () => { dialog.showModal(); if (name === 'settings') void refreshStorage(); });
    // Native dialog focus restoration runs at close; a delayed close listener could steal focus from a subsequent editor click.
  }
  const status = document.getElementById('prediction-status')!;
  let settings: PredictionSettings = { ...defaultPredictionSettings };
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
    maxN.value = String(settings.maxN); pool.value = String(settings.poolSize);
    preview.value = String(settings.previewWords); accept.value = String(settings.acceptWords);
    accept.max = String(settings.previewWords);
    for (const input of [maxN, pool, preview, accept]) input.disabled = busy || !ready;
    scales.forEach(({ slider, number }, i) => {
      slider.value = number.value = String(settings.ngramScales[i]);
      slider.disabled = number.disabled = busy || !ready;
    });
    document.getElementById('maximum-n-value')!.textContent = `N=1–${settings.maxN}`;
    const importedCount = settings.sourceMode === 'personal' ? 0 : sources.filter((source) => source.enabled && source.tokenCount > 0).length;
    const personalCount = settings.sourceMode === 'imported' || !personal.learning ? 0
      : personal.documents.filter((doc) => doc.enabled && doc.learned && doc.tokenCount > 0).length;
    const count = importedCount + personalCount;
    const corpus = personalCount ? `${importedCount} imported · ${personalCount} personal sources` : `${count} active imported ${count === 1 ? 'source' : 'sources'}`;
    message = count > 0 ? `${corpus} · Tab accepts one word · ? shows shortcuts`
      : settings.sourceMode === 'personal' ? 'My Writing has no active learned text. Enable learning in Documents, then save a document.'
        : 'No active corpus. Import text in Sources, or enable learning in Documents and save your writing.';
    setStatus(busy ? 'Updating local suggestions… You can keep writing.' : message);
    suggestions.refresh(ready && !busy && count > 0, settings.acceptWords);
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
      if ((document.getElementById('settings-dialog') as HTMLDialogElement).open) void refreshStorage();
    } catch {
      if (current !== generation) return;
      ready = false;
      render();
      setStatus('Could not load prediction settings. Reopen Sources to retry; editing is available.');
    }
  }
  async function save(): Promise<void> {
    if (pending.size || saving || !ready) { render(); return; }
    for (const input of [maxN, pool, preview, accept, ...scales.map(({ number }) => number)]) if (!input.checkValidity()) { input.reportValidity(); return; }
    const previewWords = Number(preview.value);
    const next: PredictionSettings = { sourceMode: mode.value as SourceMode, maxN: Number(maxN.value) as NgramOrder,
      poolSize: Number(pool.value), previewWords, acceptWords: Math.min(Number(accept.value), previewWords),
      ngramScales: validateNgramScales(scales.map(({ number }) => Number(number.value))) };
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
      void refreshStorage();
    }
  }
  mode.addEventListener('change', () => { void save(); });
  for (const input of [maxN, pool, preview, accept]) input.addEventListener('change', () => { void save(); });
  for (const { slider, number } of scales) {
    slider.addEventListener('input', () => { number.value = slider.value; });
    number.addEventListener('input', () => { if (number.checkValidity()) slider.value = number.value; });
    for (const input of [slider, number]) input.addEventListener('change', () => { void save(); });
  }
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
