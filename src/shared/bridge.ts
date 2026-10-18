// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import type { SourcesBridge } from './sources';
import type { PredictionBridge } from './prediction';
import type { DocumentsBridge } from './documents';

export const channels = {
  appInfo: 'app:info',
  openLink: 'app:open-link',
} as const;

export const linkLabels = {
  appWebsite: 'Project website',
  appGithubUrl: 'Project on GitHub',
  authorWebsite: 'Author website',
  authorGithub: 'Author on GitHub',
  authorWaysToSupportUrl: 'Ways to support',
  authorBuyMeACoffeeUrl: 'Buy me a coffee',
} as const;

export type LinkId = keyof typeof linkLabels;

export interface AppInfo {
  name: string;
  version: string;
  author: string;
  license: string;
  links: { id: LinkId; label: string }[];
}

export interface DesktopBridge extends SourcesBridge, PredictionBridge, DocumentsBridge {
  getAppInfo(): Promise<AppInfo>;
  openLink(id: LinkId): Promise<void>;
}
