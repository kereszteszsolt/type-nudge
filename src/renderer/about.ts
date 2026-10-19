// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import metadata from '../../brand/branding.json';
import type { AppInfo, LinkId } from '../shared/bridge';
import './about.css';

const shapes = {"globe": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z\"/>", "code": "<path d=\"m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18\"/>", "user": "<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3Z\"/>", "heart": "<path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z\"/>", "coffee": "<path d=\"M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Zm13 1h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2\"/>", "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v6m0 4h.01\"/>"} as const;
const artwork = import.meta.glob('../../brand/assets/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
let nextId = 0;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag); value.className = className; value.textContent = text; return value;
}
function asset(name: string): string {
  return /^assets\/[A-Za-z0-9_-]+\.(svg|png|ico)$/.test(name) ? artwork[`../../brand/${name}`] ?? '' : '';
}
function icon(kind: keyof typeof shapes): Element {
  const holder = node('span');
  holder.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind]}</svg>`;
  return holder.firstElementChild!;
}
function position(link: HTMLButtonElement): void {
  const tip = link.querySelector<HTMLElement>('[role="tooltip"]');
  if (!tip || !link.parentElement) return;
  const row = link.parentElement.getBoundingClientRect(); const box = link.getBoundingClientRect();
  const center = box.left - row.left + box.width / 2;
  const left = Math.max(0, Math.min(center - tip.offsetWidth / 2, row.width - tip.offsetWidth));
  tip.style.left = `${left}px`; tip.style.bottom = `${row.bottom - box.top + 10}px`;
  tip.style.setProperty('--tooltip-arrow', `${center - left}px`);
}
export function initializeAbout(info: AppInfo): void {
  const dialog = document.getElementById('about-dialog') as HTMLDialogElement;
  const content = document.getElementById('about-content')!;
  const approved = new Set(info.links.map(link => link.id));
  const error = document.getElementById('link-error')!;
  const website = approved.has('authorWebsite') ? new URL(metadata.authorWebsite).hostname : 'Author website';
  async function openLink(id: LinkId): Promise<void> {
    error.textContent = '';
    try { await window.typeNudge.openLink(id); }
    catch { error.textContent = 'Could not open your browser. Please try again.'; if (!dialog.open) dialog.showModal(); }
  }
  function action(id: LinkId, label: string, className: string): HTMLButtonElement {
    const button = node('button', className, label); button.type = 'button';
    button.addEventListener('click', () => { void openLink(id); }); return button;
  }
  function attribution(showWebsite: boolean): HTMLElement {
    const footer = node('div', 'author-attribution');
    const line = node('span', 'copyright-line', `© ${new Date().getFullYear()} ${info.author}, `);
    line.append(action('license', info.license, 'text-button license-link')); footer.append(line);
    if (showWebsite && approved.has('authorWebsite')) footer.append(action('authorWebsite', website, 'text-button author-website'));
    return footer;
  }
  document.getElementById('about-title')!.textContent = `About ${info.name}`;
  const poster = asset(metadata.appPoster);
  if (poster) {
    const image = node('img', 'about-poster'); image.src = poster; image.alt = `${info.name} project poster`; image.width = 780; image.height = 480; content.append(image);
  } else {
    const intro = node('div', 'about-intro'); intro.append(node('strong', '', info.name), node('p', '', metadata.appTagline)); content.append(intro);
  }
  const description = node('p', 'about-description', metadata.appDescription); description.id = 'app-description';
  const version = node('p', 'about-version', `Version ${info.version}`); version.id = 'app-version'; content.append(description, version);
  const project = node('nav', 'about-links'); project.id = 'about-links'; project.setAttribute('aria-label', 'Project and author links');
  const support = node('nav', 'about-links about-support-links'); support.setAttribute('aria-label', 'Support the author');
  const definitions = [
    ['authorWebsite', website, `About ${info.author}, projects and contact. Available in ${metadata.authorWebsiteLanguages.join(' | ')}.`, 'globe'],
    ['appWebsite', 'Project website', 'Visit the project website.', 'globe'],
    ['appGithubUrl', 'Source', `Source code for ${info.name}.`, 'code'],
    ['authorGithub', 'GitHub profile', `Explore ${info.author}'s projects.`, 'user'],
    ['authorBuyMeACoffeeUrl', 'Buy me a Coffee', `Support ${info.author} on Buy Me a Coffee.`, 'coffee'],
    ['authorWaysToSupportUrl', 'Ways to support', `Ways to support ${info.author}'s work.`, 'heart'],
  ] as const;
  for (const [id, label, detail, kind] of definitions) {
    if (!approved.has(id)) continue;
    const button = action(id, '', 'about-link' + (kind === 'coffee' ? ' coffee-link' : ''));
    button.setAttribute('aria-label', label);
    button.append(icon(kind), document.createTextNode(label));
    const tip = node('span', 'link-tooltip'); tip.id = `about-tip-${++nextId}`; tip.role = 'tooltip';
    tip.append(node('span', '', detail), node('span', 'tooltip-url', metadata[id])); button.append(tip); button.setAttribute('aria-describedby', tip.id);
    button.addEventListener('pointerenter', () => position(button)); button.addEventListener('focus', () => position(button));
    (kind === 'coffee' || kind === 'heart' ? support : project).append(button);
  }
  content.append(project);
  if (support.children.length) {
    content.append(support);
    if (metadata.supportRemarkText) { const note = node('div', 'about-support-note'); note.setAttribute('role', 'note'); note.append(icon('info'), node('p', '', metadata.supportRemarkText)); content.append(note); }
  }
  content.append(attribution(false)); document.querySelector('.status-bar')!.append(attribution(true));
  const about = document.getElementById('about-button') as HTMLButtonElement; about.disabled = false;
  about.addEventListener('click', () => dialog.showModal());
  dialog.querySelector<HTMLButtonElement>('.about-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close(); });
}
