import {
  EditorState,
  Compartment,
  Extension,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  HighlightStyle,
  syntaxTree,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

import { toggleBold, toggleItalic, toggleHeading, countWords } from "./markdown-toggle";
import { wysiwygPlugin } from "./wysiwyg";

export interface EditorHandle {
  view: EditorView;
  setContent(text: string): void;
  getContent(): string;
  setEditable(val: boolean): void;
  setWysiwyg(val: boolean): void;
}

// Highlight style: map Lezer tags to CSS class names
const crtHighlight = HighlightStyle.define([
  { tag: tags.heading1, class: "tok-h1" },
  { tag: tags.heading2, class: "tok-h2" },
  { tag: tags.heading3, class: "tok-h3" },
  { tag: tags.strong, class: "tok-strong" },
  { tag: tags.emphasis, class: "tok-em" },
  { tag: tags.monospace, class: "tok-code" },
  { tag: tags.link, class: "tok-link" },
  { tag: tags.url, class: "tok-url" },
  { tag: tags.quote, class: "tok-quote" },
  { tag: tags.comment, class: "tok-comment" },
]);

interface MountOptions {
  content: string;
  wysiwyg: boolean;
  onChange(words: number, chars: number): void;
  onSave(): void;
  onNew(): void;
}

export function mountEditor(el: HTMLElement, opts: MountOptions): EditorHandle {
  const editableCompartment = new Compartment();
  const wysiwygCompartment = new Compartment();

  const shortcutMap = keymap.of([
    {
      key: "Mod-b",
      run: (view) => toggleBold(view),
    },
    {
      key: "Mod-i",
      run: (view) => toggleItalic(view),
    },
    {
      key: "Mod-1",
      run: (view) => toggleHeading(view, 1),
    },
    {
      key: "Mod-2",
      run: (view) => toggleHeading(view, 2),
    },
    {
      key: "Mod-3",
      run: (view) => toggleHeading(view, 3),
    },
    {
      key: "Mod-s",
      run: () => { opts.onSave(); return true; },
    },
    {
      key: "Mod-n",
      run: () => { opts.onNew(); return true; },
    },
    {
      // When cursor is right before a closing emphasis mark (**|** or *|*),
      // place the newline after the closing mark so bold/italic stays intact.
      key: "Enter",
      run: (view) => {
        const { state } = view;
        const sel = state.selection.main;
        if (!sel.empty) return false;
        const pos = sel.from;
        const tree = syntaxTree(state);
        let node = tree.resolve(pos, 1);
        while (node.parent) {
          if (node.name === "StrongEmphasis" || node.name === "Emphasis") {
            const closing = node.lastChild;
            if (closing && closing.name === "EmphasisMark" && closing.from >= pos) {
              view.dispatch({
                changes: { from: closing.to, insert: "\n" },
                selection: { anchor: closing.to + 1 },
              });
              return true;
            }
            break;
          }
          node = node.parent;
        }
        return false;
      },
    },
  ]);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const { words, chars } = countWords(update.state.doc);
      opts.onChange(words, chars);
    }
  });

  const baseTheme = EditorView.theme({
    "&": { height: "100%", fontSize: "14px" },
    ".cm-scroller": { overflow: "auto", fontFamily: "inherit" },
    ".cm-content": { padding: "16px 20px", minHeight: "100%" },
    ".cm-cursor": { borderLeftWidth: "2px" },
    ".cm-selectionBackground, ::selection": { background: "rgba(255,176,0,0.25)" },
    ".cm-activeLine": { background: "transparent" },
    ".cm-gutters": { display: "none" },
  });

  const state = EditorState.create({
    doc: opts.content,
    extensions: [
      history(),
      drawSelection(),
      highlightActiveLine(),
      markdown(),
      syntaxHighlighting(crtHighlight),
      shortcutMap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      editableCompartment.of(EditorView.editable.of(true)),
      wysiwygCompartment.of(opts.wysiwyg ? wysiwygPlugin : []),
      EditorView.lineWrapping,
      updateListener,
      baseTheme,
    ],
  });

  const view = new EditorView({ state, parent: el });

  // Report initial counts
  const { words, chars } = countWords(state.doc);
  opts.onChange(words, chars);

  return {
    view,
    setContent(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
    getContent() {
      return view.state.doc.toString();
    },
    setEditable(val) {
      view.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(val)),
      });
    },
    setWysiwyg(val) {
      view.dispatch({
        effects: wysiwygCompartment.reconfigure(val ? wysiwygPlugin : []),
      });
    },
  };
}
