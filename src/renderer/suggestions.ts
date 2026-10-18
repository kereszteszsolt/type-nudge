// SPDX-FileCopyrightText: 2026 Keresztes Zsolt <https://kereszteszsolt.hu>
// SPDX-License-Identifier: Apache-2.0

import { Prec, StateEffect, Transaction, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import type { PredictionInput, PredictionResult } from '../shared/prediction';
import { predictionContext, completionSuffix } from './prediction-context';
import { LatestRequest } from './latest-request';

class Ghost extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: Ghost): boolean { return this.text === other.text; }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-ghost';
    span.textContent = this.text;
    span.setAttribute('aria-hidden', 'true');
    span.contentEditable = 'false';
    return span;
  }
  ignoreEvent(): boolean { return true; }
}

export function createSuggestions(
  predict: (input: PredictionInput) => Promise<PredictionResult>,
  reportError: (failed: boolean) => void,
): { extension: Extension; refresh: (enabled: boolean) => void } {
  const refresh = StateEffect.define<null>();
  const show = StateEffect.define<{ pos: number; suffixes: string[] }>();
  const cycle = StateEffect.define<null>();
  const dismiss = StateEffect.define<null>();
  let enabled = false;
  let instance: Suggestions | undefined;
  class Suggestions {
    decorations: DecorationSet = Decoration.none;
    private readonly requests = new LatestRequest();
    private current: { pos: number; suffixes: string[]; index: number } | null = null;
    private composing = false;
    constructor(readonly view: EditorView) { instance = this; }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.focusChanged ||
          update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refresh)))) {
        this.clear();
        this.schedule();
        return;
      }
      for (const transaction of update.transactions) for (const effect of transaction.effects) {
        if (effect.is(show)) this.current = { ...effect.value, index: 0 };
        if (effect.is(cycle) && this.current) this.current.index = (this.current.index + 1) % this.current.suffixes.length;
        if (effect.is(dismiss)) this.clear();
      }
      const current = this.current;
      this.decorations = current
        ? Decoration.set([Decoration.widget({ widget: new Ghost(current.suffixes[current.index]!), side: 1 }).range(current.pos)])
        : Decoration.none;
    }
    private clear(): void { this.requests.cancel(); this.current = null; this.decorations = Decoration.none; }
    private available(): boolean { return enabled && this.view.hasFocus && !this.composing && !this.view.compositionStarted; }
    private schedule(): void {
      if (!this.available()) return;
      const input = predictionContext(this.view.state);
      if (!input) return;
      const pos = this.view.state.selection.main.head;
      this.requests.schedule(() => predict(input), (result) => {
        if (!this.available()) return;
        const suffixes = [...new Set(result.candidates.slice(0, 3).map((candidate) => completionSuffix(candidate, input.prefix)).filter(Boolean))];
        reportError(false);
        if (suffixes.length) this.view.dispatch({ effects: show.of({ pos, suffixes }) });
      }, () => reportError(true));
    }
    command(action: 'accept' | 'cycle' | 'dismiss'): boolean {
      if (!this.available() || !this.view.state.selection.main.empty) return false;
      if (!this.current) {
        if (action === 'dismiss') this.requests.cancel();
        return false;
      }
      if (action === 'accept') {
        const { pos, suffixes, index } = this.current;
        const insert = suffixes[index]!;
        this.view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length },
          annotations: [Transaction.userEvent.of('input.complete'), isolateHistory.of('full')], scrollIntoView: true });
      } else this.view.dispatch({ effects: (action === 'cycle' ? cycle : dismiss).of(null) });
      return true;
    }
    composition(started: boolean): void {
      this.composing = started;
      this.view.dispatch({ effects: refresh.of(null) });
      // CodeMirror finalizes composition after the DOM event has completed.
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
      { key: 'Tab', run: (view) => view.plugin(plugin)?.command('accept') ?? false },
      { key: 'Alt-ArrowDown', run: (view) => view.plugin(plugin)?.command('cycle') ?? false },
      { key: 'Escape', run: (view) => view.plugin(plugin)?.command('dismiss') ?? false },
    ]))],
    refresh(value) { enabled = value; instance?.view.dispatch({ effects: refresh.of(null) }); },
  };
}
