// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { createEditor } from './editor';
import { initializeAbout } from './about';
import './styles.css';
import { initializeSources } from './sources';
import { initializePrediction } from './prediction-controls';
import { initializeDocuments } from './documents';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as T;
}

async function start(): Promise<void> {
  const prediction = initializePrediction();
  const documents = initializeDocuments(prediction.documentsBusy);
  const editor = createEditor(element('editor'), [prediction.extension, documents.extension]);
  documents.attach(editor);
  initializeSources(prediction.sourcesBusy);
  prediction.start();
  const info = await window.typeNudge.getAppInfo();
  document.title = info.name;
  element('app-name').textContent = info.name;
  initializeAbout(info);
  editor.focus();
  window.addEventListener('pagehide', () => editor.destroy(), { once: true });
}

void start().catch((error: unknown) => {
  console.error('Unable to initialize editor:', error);
  element('startup-error').hidden = false;
});
