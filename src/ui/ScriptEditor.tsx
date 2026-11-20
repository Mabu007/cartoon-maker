import { useEffect, useRef } from 'react';
import { Schema } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { scriptTypes, uid, type ScriptLine } from '../engine/schema.ts';
import 'prosemirror-view/style/prosemirror.css';

const schema = new Schema({
  nodes: {
    doc: { content: 'line+' },
    text: { group: 'inline' },
    line: {
      content: 'text*', group: 'block', attrs: { id: { default: '' }, type: { default: 'action' }, characterId: { default: null }, directions: { default: [] } },
      toDOM: node => ['p', { 'data-type': node.attrs.type, 'data-line-id': node.attrs.id }, 0],
      parseDOM: [{ tag: 'p', getAttrs: node => ({ type: scriptTypes.find(item => item === node.dataset.type) ?? 'action' }) }]
    }
  }
});

function documentFor(lines: ScriptLine[]) {
  return schema.nodes.doc.create(null, lines.map(line => schema.nodes.line.create(line, line.text ? schema.text(line.text) : undefined)));
}

export function ScriptEditor({ lines, onChange, onSelect, jumpTo }: {
  lines: ScriptLine[]; onChange: (lines: ScriptLine[]) => void; onSelect: (id: string) => void; jumpTo?: { id: string };
}) {
  const host = useRef<HTMLDivElement>(null), editor = useRef<EditorView>(null);
  const live = useRef({ lines, onChange, onSelect });
  live.current = { lines, onChange, onSelect };
  useEffect(() => {
    function format(view: EditorView, type: ScriptLine['type']) {
      const { state } = view;
      const from = state.selection.$from;
      if (!from.depth) return false;
      view.dispatch(state.tr.setNodeMarkup(from.before(1), undefined, { ...from.parent.attrs, type }));
      return true;
    }
    const view = new EditorView(host.current, {
      state: EditorState.create({ doc: documentFor(live.current.lines), plugins: [
        history(),
        keymap({
          'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo,
          'Mod-Alt-1': (_s, _d, v) => Boolean(v && format(v, 'scene-heading')),
          'Mod-Alt-2': (_s, _d, v) => Boolean(v && format(v, 'action')),
          'Mod-Alt-3': (_s, _d, v) => Boolean(v && format(v, 'character')),
          'Mod-Alt-4': (_s, _d, v) => Boolean(v && format(v, 'dialogue')),
          'Shift-Tab': (_s, _d, v) => {
            if (!v) return false;
            const index = scriptTypes.indexOf(v.state.selection.$from.parent.attrs.type);
            return format(v, scriptTypes[(index + scriptTypes.length - 1) % scriptTypes.length]);
          },
          Tab: (_s, _d, v) => {
            if (!v) return false;
            const index = scriptTypes.indexOf(v.state.selection.$from.parent.attrs.type);
            return format(v, scriptTypes[(index + 1) % scriptTypes.length]);
          },
          Enter: (state, dispatch) => {
            if (state.doc.childCount >= 150 || !dispatch) return true;
            const original = state.selection.$from.parent.attrs;
            const next = original.type === 'character' || original.type === 'parenthetical' ? 'dialogue' : 'action';
            const tr = state.tr.deleteSelection();
            const at = tr.selection.from;
            tr.split(at, 1, [{ type: schema.nodes.line, attrs: { id: uid(), type: next,
              characterId: next === 'dialogue' ? original.characterId : null, directions: [] } }]);
            dispatch(tr.scrollIntoView());
            return true;
          }
        }),
        keymap(baseKeymap),
        new Plugin({
          filterTransaction: tr => {
            if (tr.doc.childCount > 150) return false;
            let valid = true;
            tr.doc.forEach(node => { if (node.textContent.length > 400) valid = false; });
            return valid;
          },
          appendTransaction: (transactions, _old, state) => {
            if (!transactions.some(tr => tr.docChanged)) return;
            const ids = new Set<string>(), tr = state.tr;
            state.doc.forEach((node, offset) => {
              const id = node.attrs.id;
              if (!id || ids.has(id)) tr.setNodeMarkup(offset, undefined, { ...node.attrs, id: uid() });
              else ids.add(id);
            });
            return tr.docChanged ? tr : undefined;
          }
        })
      ] }),
      attributes: { 'aria-label': 'Screenplay page', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' },
      dispatchTransaction(transaction) {
        const result = view.state.applyTransaction(transaction);
        view.updateState(result.state);
        const selection = result.state.selection.$from.parent.attrs.id;
        if (selection) live.current.onSelect(selection);
        if (result.transactions.some(item => item.docChanged)) {
          const next: ScriptLine[] = [];
          result.state.doc.forEach(node => {
            const { id, type, characterId, directions } = node.attrs;
            next.push({ id, type, ...(characterId ? { characterId } : {}), text: node.textContent, directions });
          });
          live.current.onChange(next);
        }
      }
    });
    editor.current = view;
    return () => { editor.current = null; view.destroy(); };
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    const next = documentFor(lines);
    if (!next.eq(view.state.doc)) {
      const at = Math.min(view.state.selection.from, next.content.size - 1);
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, next.content).setMeta('addToHistory', false);
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(1, at))));
      // Apply external changes without echoing a second app-level edit.
      view.updateState(view.state.apply(tr));
    }
  }, [lines]);
  useEffect(() => {
    const view = editor.current;
    if (!view || !jumpTo) return;
    let at: number | undefined;
    view.state.doc.forEach((node, offset) => { if (node.attrs.id === jumpTo.id) at = offset + 1; });
    if (at === undefined) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)).scrollIntoView());
    view.focus();
  }, [jumpTo]);
  return <div className="script-editor" ref={host}/>;
}
