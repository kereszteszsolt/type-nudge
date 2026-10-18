// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { createEditor } from './editor';
import type { LinkId } from '../shared/bridge';
import './styles.css';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as T;
}

async function start(): Promise<void> {
  const editor = createEditor(element('editor'));
  const info = await window.typeNudge.getAppInfo();
  document.title = info.name;
  element('app-name').textContent = info.name;
  element('about-title').textContent = `About ${info.name}`;
  element('app-version').textContent = `Version ${info.version}`;
  element('app-author').textContent = `By ${info.author}`;
  element('app-license').textContent = info.license;

  async function openLink(id: LinkId): Promise<void> {
    element('link-error').textContent = '';
    try {
      await window.typeNudge.openLink(id);
    } catch {
      element('link-error').textContent = 'Could not open your browser. Please try again.';
      element<HTMLDialogElement>('about-dialog').showModal();
    }
  }

  const dialog = element<HTMLDialogElement>('about-dialog');
  const about = element<HTMLButtonElement>('about-button');
  about.disabled = false;
  about.addEventListener('click', () => dialog.showModal());
  for (const link of info.links) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-button';
    button.textContent = link.label;
    button.addEventListener('click', () => { void openLink(link.id); });
    element('about-links').append(button);
  }
  const support = element<HTMLButtonElement>('support-button');
  if (info.links.some((link) => link.id === 'authorWaysToSupportUrl')) {
    support.hidden = false;
    support.addEventListener('click', () => { void openLink('authorWaysToSupportUrl'); });
  }
  editor.focus();
  window.addEventListener('pagehide', () => editor.destroy(), { once: true });
}

void start().catch((error: unknown) => {
  console.error('Unable to initialize editor:', error);
  element('startup-error').hidden = false;
});
