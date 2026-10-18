// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { EditorView, keymap } from '@codemirror/view';
import { validateSaveDocument, type DocumentSummary, type PersonalState } from '../shared/documents';
import { replaceEditorDocument } from './editor';
import { unwrap } from './prediction-controls';

export function initializeDocuments(onBusy: (busy: boolean) => void) {
  const node = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const name = node<HTMLInputElement>('document-name');
  const dialog = node<HTMLDialogElement>('documents-dialog');
  const learning = node<HTMLInputElement>('personal-learning');
  const status = node('documents-status');
  const note = node('session-note');
  const errorNote = node('document-error');
  const list = node('documents-list');
  let editor: EditorView;
  let current: DocumentSummary | null = null;
  let baseline = { name: 'Untitled', text: '' };
  let busy = false;
  let editRevision = 0;
  let state: PersonalState = { learning: false, documents: [] };
  const dirty = () => name.value !== baseline.name || editor.state.doc.toString() !== baseline.text;
  function renderNote(): void {
    note.textContent = busy ? 'Working locally… Unsaved edits remain in this window.'
      : dirty() ? 'Unsaved changes · Save to keep this text on this device.'
        : current ? 'Saved on this device.' : 'New document · Use Save to keep your text.';
    node('document-title').textContent = (current?.name ?? 'Untitled') + (dirty() ? ' *' : '');
  }
  async function confirm(message: string, action: string): Promise<boolean> {
    const confirmation = node<HTMLDialogElement>('confirm-dialog');
    node('confirm-message').textContent = message;
    node('confirm-action').textContent = action;
    confirmation.returnValue = '';
    confirmation.showModal();
    return new Promise((resolve) => confirmation.addEventListener('close', () => resolve(confirmation.returnValue === 'confirm'), { once: true }));
  }
  async function discard(): Promise<boolean> {
    return !dirty() || await confirm('Discard the unsaved changes in the current document?', 'Discard changes');
  }
  function showDocument(doc: DocumentSummary | null, text: string): void {
    current = doc;
    baseline = { name: doc?.name ?? 'Untitled', text };
    name.value = baseline.name;
    replaceEditorDocument(editor, text);
    renderNote();
  }
  function setBusy(value: boolean): void {
    busy = value;
    for (const control of document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('#new-document, #save-document, #documents-list button, #documents-list input, #reset-learning, #personal-learning')) control.disabled = value;
    dialog.setAttribute('aria-busy', String(value));
    onBusy(value);
    renderNote();
  }
  async function refresh(): Promise<void> {
    state = unwrap(await window.typeNudge.listDocuments());
    learning.checked = state.learning;
    list.replaceChildren();
    node('documents-empty').hidden = state.documents.length > 0;
    for (const doc of state.documents) {
      const row = document.createElement('li');
      const description = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = doc.name;
      const detail = document.createElement('span');
      detail.textContent = `Revision ${doc.revision} · ${doc.learned ? `${doc.tokenCount} learned words${doc.indexMaxN < 7 ? ' · N=4–7 pending · Save again with learning on to upgrade' : ' · N=1–7 ready'}` : 'Not learned'}`;
      description.append(title, detail);
      const actions = document.createElement('div'); actions.className = 'source-actions';
      const label = document.createElement('label'), enabled = document.createElement('input');
      enabled.type = 'checkbox'; enabled.checked = doc.enabled; enabled.disabled = busy;
      enabled.setAttribute('aria-label', `Use ${doc.name} for predictions`);
      enabled.addEventListener('change', () => { void run(async () => {
        try { unwrap(await window.typeNudge.setDocumentEnabled(doc.id, enabled.checked)); }
        catch (error) { enabled.checked = doc.enabled; throw error; }
        return 'Personal prediction source updated.';
      }); });
      label.append(enabled, 'Use'); actions.append(label);
      for (const [text, operation] of [
        ['Open', async () => {
          if (!await discard()) return '';
          const expected = editRevision;
          const opened = unwrap(await window.typeNudge.openDocument(doc.id));
          if (expected !== editRevision) throw new Error('Opening canceled because you edited the current document while it was loading.');
          showDocument(opened, opened.text); dialog.close(); editor.focus(); return 'Document opened.';
        }],
        ['Remove learning', async () => {
          if (!await confirm(`Remove learned counts for “${doc.name}”? The saved text stays. A later save with learning on can learn it again.`, 'Remove learning')) return '';
          unwrap(await window.typeNudge.forgetDocument(doc.id)); return 'Learned contribution removed; saved text kept.';
        }],
        ['Delete', async () => {
          if (!await confirm(`Delete “${doc.name}” and its learned counts from this device?${current?.id === doc.id && dirty() ? ' Unsaved changes in this document will also be discarded.' : ''}`, 'Delete document')) return '';
          const expected = editRevision;
          unwrap(await window.typeNudge.deleteDocument(doc.id));
          if (current?.id === doc.id) {
            if (expected === editRevision) showDocument(null, '');
            else { current = null; baseline = { name: 'Untitled', text: '' }; }
          }
          return 'Document and its learned contribution deleted.';
        }],
      ] as const) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
        button.setAttribute('aria-label', `${text} ${doc.name}`); button.disabled = busy;
        button.addEventListener('click', () => { void run(operation); }); actions.append(button);
      }
      row.append(description, actions); list.append(row);
    }
  }
  async function run(operation: () => Promise<string>): Promise<void> {
    if (busy) return;
    errorNote.hidden = true;
    setBusy(true); status.textContent = 'Working with local documents…';
    try { const message = await operation(); await refresh(); status.textContent = message; }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update documents.';
      status.textContent = message; errorNote.textContent = message; errorNote.hidden = false;
    }
    finally { setBusy(false); }
  }
  async function save(): Promise<void> {
    if (busy) return;
    const snapshot = { name: name.value, text: editor.state.doc.toString() };
    await run(async () => {
      const input = validateSaveDocument({ id: current?.id ?? null, revision: current?.revision ?? null, ...snapshot });
      current = unwrap(await window.typeNudge.saveDocument(input));
      baseline = { name: current.name, text: snapshot.text };
      // Edits made while awaiting IPC remain dirty instead of being overwritten.
      if (name.value === snapshot.name) name.value = current.name;
      return current.learned ? 'Document saved and learned locally.' : 'Document saved without learning.';
    });
  }
  node('save-document').addEventListener('click', () => { void save(); });
  node('new-document').addEventListener('click', () => { void run(async () => {
    if (await discard()) { showDocument(null, ''); editor.focus(); }
    return '';
  }); });
  node('documents-button').addEventListener('click', () => { dialog.showModal(); void run(async () => ''); });
  learning.addEventListener('change', () => { void run(async () => {
    try { unwrap(await window.typeNudge.setPersonalLearning(learning.checked)); }
    catch (error) { learning.checked = state.learning; throw error; }
    return learning.checked ? 'Learning enabled for future explicit saves. Existing unlearned documents are unchanged.'
      : 'Learning and personal predictions paused. Existing learned data stays until removed or reset.';
  }); });
  node('reset-learning').addEventListener('click', () => { void run(async () => {
    if (!await confirm('Reset all personal learned data and turn learning off? Saved documents and imported sources stay.', 'Reset learned data')) return '';
    unwrap(await window.typeNudge.resetPersonalLearning()); return 'Personal learned data reset. Learning is off; documents and imports kept.';
  }); });
  name.addEventListener('input', () => { editRevision++; renderNote(); });
  window.addEventListener('beforeunload', (event) => {
    if (dirty() || busy) { event.preventDefault(); event.returnValue = ''; }
  });
  return {
    extension: [EditorView.updateListener.of((update) => { if (update.docChanged) { editRevision++; renderNote(); } }),
      keymap.of([{ key: 'Mod-s', run: () => { void save(); return true; } }])],
    attach(view: EditorView) { editor = view; renderNote(); },
  };
}
