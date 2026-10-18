// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

export function createEditor(parent: HTMLElement): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.cspNonce.of('typenudge-style'),
        EditorView.theme({
          '&': { height: '100%' },
          '&.cm-focused': { outline: '2px solid #638471', outlineOffset: '-2px' },
          '.cm-scroller': {
            overflow: 'auto', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '18px', lineHeight: '1.75',
          },
          '.cm-content': { padding: '30px 32px', minHeight: '100%' },
          '.cm-line': { padding: '0' },
          '.cm-placeholder': { color: '#858d85' },
          '.cm-cursor': { borderLeftColor: '#315e49' },
          '@media (max-width: 600px)': { '.cm-content': { padding: '20px' } },
        }),
        EditorView.contentAttributes.of({
          'aria-label': 'Document text',
          'aria-describedby': 'session-note',
          spellcheck: 'false',
        }),
        placeholder('Start writing…'),
      ],
    }),
  });
}
