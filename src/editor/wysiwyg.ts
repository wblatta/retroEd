import {
  ViewPlugin,
  DecorationSet,
  Decoration,
  ViewUpdate,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

class HiddenWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "none";
    return span;
  }
}

const hiddenWidget = Decoration.replace({ widget: new HiddenWidget() });

function buildDecorations(view: EditorView): DecorationSet {
  const { doc, selection } = view.state;
  const decorations: Array<{ from: number; to: number; value: Decoration }> = [];

  // Collect all lines touched by any selection range
  const selectedLines = new Set<number>();
  for (const range of selection.ranges) {
    const startLine = doc.lineAt(range.from).number;
    const endLine = doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) {
      selectedLines.add(n);
    }
  }

  const isOffLine = (from: number, to: number): boolean => {
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;
    for (let n = startLine; n <= endLine; n++) {
      if (selectedLines.has(n)) return false;
    }
    return true;
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const name = node.name;

        if (/^ATXHeading[1-6]$/.test(name)) {
          const level = parseInt(name[name.length - 1]);
          const line = doc.lineAt(node.from);
          decorations.push({
            from: line.from,
            to: line.from,
            value: Decoration.line({ class: `md-h md-h${level}` }),
          });
          return;
        }

        if (name === "HeaderMark" && isOffLine(node.from, node.to)) {
          // hide "# " prefix including the space after the marks
          const end = Math.min(node.to + 1, doc.length);
          decorations.push({
            from: node.from,
            to: end,
            value: hiddenWidget,
          });
          return;
        }

        if (name === "StrongEmphasis") {
          decorations.push({
            from: node.from,
            to: node.to,
            value: Decoration.mark({ class: "md-bold" }),
          });
          return;
        }

        if (name === "Emphasis") {
          decorations.push({
            from: node.from,
            to: node.to,
            value: Decoration.mark({ class: "md-italic" }),
          });
          return;
        }

        if (name === "EmphasisMark" && isOffLine(node.from, node.to)) {
          decorations.push({
            from: node.from,
            to: node.to,
            value: hiddenWidget,
          });
          return;
        }

        if (name === "InlineCode") {
          decorations.push({
            from: node.from,
            to: node.to,
            value: Decoration.mark({ class: "md-code" }),
          });
          return;
        }

        if (name === "CodeMark" && isOffLine(node.from, node.to)) {
          decorations.push({
            from: node.from,
            to: node.to,
            value: hiddenWidget,
          });
          return;
        }

        if (name === "Blockquote") {
          const startLine = doc.lineAt(node.from).number;
          const endLine = doc.lineAt(node.to).number;
          for (let n = startLine; n <= endLine; n++) {
            const line = doc.line(n);
            decorations.push({
              from: line.from,
              to: line.from,
              value: Decoration.line({ class: "md-quote" }),
            });
          }
          return;
        }

        if (name === "QuoteMark" && isOffLine(node.from, node.to)) {
          // hide "> " (mark + space)
          const end = Math.min(node.to + 1, doc.length);
          decorations.push({
            from: node.from,
            to: end,
            value: hiddenWidget,
          });
          return;
        }

        if (name === "HorizontalRule") {
          const line = doc.lineAt(node.from);
          decorations.push({
            from: line.from,
            to: line.from,
            value: Decoration.line({ class: "md-hr" }),
          });
          if (isOffLine(node.from, node.to)) {
            decorations.push({
              from: node.from,
              to: node.to,
              value: hiddenWidget,
            });
          }
          return;
        }

        if ((name === "Link" || name === "Image") && isOffLine(node.from, node.to)) {
          // Hide everything except the display text inside []
          // Structure: [text](url) or ![text](url)
          // Walk children to find LinkMark, URL etc.
          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              const childName = cursor.name;
              if (
                childName === "LinkMark" ||
                childName === "URL" ||
                childName === "LinkTitle"
              ) {
                decorations.push({
                  from: cursor.from,
                  to: cursor.to,
                  value: hiddenWidget,
                });
              }
            } while (cursor.nextSibling());
          }
          return;
        }
      },
    });
  }

  decorations.sort((a, b) => a.from - b.from || a.to - b.to);

  const ranges: Range<Decoration>[] = decorations.map((d) =>
    d.value.range(d.from, d.to)
  );
  return Decoration.set(ranges, true);
}

export const wysiwygPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
