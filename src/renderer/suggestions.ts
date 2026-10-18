// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { Prec, StateEffect, Transaction, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import type { PredictionCandidate, PredictionInput, PredictionResult } from '../shared/prediction';
import { predictionContext, completionSuffix } from './prediction-context';
import { LatestRequest } from './latest-request';

class Ghost extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: Ghost): boolean { return this.text === other.text; }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ghost'; span.textContent = this.text;
    span.setAttribute('aria-hidden', 'true'); span.contentEditable = 'false';
    return span;
  }
  ignoreEvent(): boolean { return true; }
}
interface Preview { pos: number; words: readonly PredictionCandidate[]; segments: readonly string[] }
export function createSuggestions(
  predict: (input: PredictionInput) => Promise<PredictionResult>, reportError: (failed: boolean) => void,
): { extension: Extension; refresh: (enabled: boolean, acceptWords?: number) => void } {
  const refresh = StateEffect.define<null>();
  const show = StateEffect.define<Preview>();
  const accepted = StateEffect.define<Preview | null>();
  const dismiss = StateEffect.define<null>();
  let enabled = false, acceptWords = 2;
  let instance: Suggestions | undefined;
  class Suggestions {
    decorations: DecorationSet = Decoration.none;
    private readonly requests = new LatestRequest();
    private current: Preview | null = null;
    private composing = false;
    constructor(readonly view: EditorView) { instance = this; }
    update(update: ViewUpdate): void {
      const consumed = update.transactions.flatMap((tr) => tr.effects).find((effect) => effect.is(accepted));
      if (consumed) {
        this.requests.cancel(); this.current = consumed.value as Preview | null;
      } else if (update.docChanged || update.selectionSet || update.focusChanged ||
          update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refresh)))) {
        this.clear(); this.schedule(); return;
      } else for (const tr of update.transactions) for (const effect of tr.effects) {
        if (effect.is(show)) this.current = effect.value;
        if (effect.is(dismiss)) this.clear();
      }
      this.decorations = this.current ? Decoration.set([
        Decoration.widget({ widget: new Ghost(this.current.segments.join('')), side: 1 }).range(this.current.pos),
      ]) : Decoration.none;
    }
    private clear(): void { this.requests.cancel(); this.current = null; this.decorations = Decoration.none; }
    private available(): boolean { return enabled && this.view.hasFocus && !this.composing && !this.view.compositionStarted; }
    private schedule(avoidWord?: string): void {
      if (!this.available()) return;
      const input = predictionContext(this.view.state);
      if (!input) return;
      const pos = this.view.state.selection.main.head;
      this.requests.schedule(() => predict({ ...input, ...(avoidWord ? { avoidWord } : {}) }), (result) => {
        if (!this.available()) return;
        reportError(false);
        const words = result.words.slice(0, 10);
        if (!words.length) return;
        const first = completionSuffix(words[0]!, input.prefix);
        if (!first) return;
        const before = this.view.state.sliceDoc(Math.max(0, pos - 1), pos);
        const leading = !input.prefix && before && !/\s/u.test(before) ? ' ' : '';
        const segments = [leading + first, ...words.slice(1).map((word) => ' ' + word.display)];
        this.view.dispatch({ effects: show.of({ pos, words, segments }) });
      }, () => reportError(true));
    }
    command(action: 'one' | 'some' | 'all' | 'next' | 'dismiss'): boolean {
      if (!this.available() || !this.view.state.selection.main.empty) return false;
      if (!this.current) { if (action === 'dismiss') this.requests.cancel(); return false; }
      const current = this.current;
      if (action === 'dismiss' || action === 'next') {
        this.view.dispatch({ effects: dismiss.of(null) });
        if (action === 'next') this.schedule(current.words[0]?.word);
      } else {
        const count = Math.min(current.words.length, action === 'one' ? 1 : action === 'some' ? acceptWords : current.words.length);
        const insert = current.segments.slice(0, count).join('');
        const pos = current.pos + insert.length;
        const rest = current.words.length > count ? { pos, words: current.words.slice(count), segments: current.segments.slice(count) } : null;
        this.view.dispatch({ changes: { from: current.pos, insert }, selection: { anchor: pos }, effects: accepted.of(rest),
          annotations: [Transaction.userEvent.of('input.complete'), isolateHistory.of('full')], scrollIntoView: true });
      }
      return true;
    }
    composition(started: boolean): void {
      this.composing = started; this.view.dispatch({ effects: refresh.of(null) });
      if (!started) this.requests.schedule(async () => null, () => this.view.dispatch({ effects: refresh.of(null) }), () => {}, 0);
    }
    destroy(): void { this.requests.destroy(); if (instance === this) instance = undefined; }
  }
  const plugin = ViewPlugin.fromClass(Suggestions, {
    decorations: (value) => value.decorations,
    eventHandlers: {
      compositionstart() { this.composition(true); return false; },
      compositionend() { this.composition(false); return false; },
    },
  });
  return {
    extension: [plugin, Prec.highest(keymap.of([
      { key: 'Tab', run: (view) => view.plugin(plugin)?.command('one') ?? false },
      { key: 'Alt-ArrowRight', run: (view) => view.plugin(plugin)?.command('some') ?? false },
      { key: 'Alt-Enter', run: (view) => view.plugin(plugin)?.command('all') ?? false },
      { key: 'Alt-ArrowDown', run: (view) => view.plugin(plugin)?.command('next') ?? false },
      { key: 'Escape', run: (view) => view.plugin(plugin)?.command('dismiss') ?? false },
    ]))],
    refresh(value, count = acceptWords) { enabled = value; acceptWords = count; instance?.view.dispatch({ effects: refresh.of(null) }); },
  };
}
