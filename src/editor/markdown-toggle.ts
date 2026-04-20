import { EditorView } from "@codemirror/view";
import { EditorSelection, Text } from "@codemirror/state";

function wrapSelection(view: EditorView, marker: string): boolean {
  const changes = view.state.changeByRange((range) => {
    const selected = view.state.sliceDoc(range.from, range.to);
    const len = marker.length;

    if (
      selected.startsWith(marker) &&
      selected.endsWith(marker) &&
      selected.length >= len * 2
    ) {
      const unwrapped = selected.slice(len, selected.length - len);
      return {
        changes: { from: range.from, to: range.to, insert: unwrapped },
        range: EditorSelection.range(range.from, range.from + unwrapped.length),
      };
    }

    const wrapped = marker + selected + marker;
    return {
      changes: { from: range.from, to: range.to, insert: wrapped },
      range: EditorSelection.range(range.from + len, range.to + len),
    };
  });
  view.dispatch(changes);
  return true;
}

export function toggleBold(view: EditorView): boolean {
  return wrapSelection(view, "**");
}

export function toggleItalic(view: EditorView): boolean {
  return wrapSelection(view, "*");
}

export function toggleHeading(view: EditorView, level: 1 | 2 | 3): boolean {
  const prefix = "#".repeat(level) + " ";
  const changes = view.state.changeByRange((range) => {
    const line = view.state.doc.lineAt(range.from);
    const lineText = line.text;

    // Check if the line already has this exact heading level
    if (lineText.startsWith(prefix)) {
      const newText = lineText.slice(prefix.length);
      const delta = -prefix.length;
      return {
        changes: { from: line.from, to: line.to, insert: newText },
        range: EditorSelection.range(
          Math.max(line.from, range.from + delta),
          Math.max(line.from, range.to + delta)
        ),
      };
    }

    // Strip any existing heading prefix
    const stripped = lineText.replace(/^#{1,6} /, "");
    const newText = prefix + stripped;
    const delta = newText.length - lineText.length;
    return {
      changes: { from: line.from, to: line.to, insert: newText },
      range: EditorSelection.range(range.from + delta, range.to + delta),
    };
  });
  view.dispatch(changes);
  return true;
}

export function countWords(doc: Text): { words: number; chars: number } {
  const text = doc.toString();
  const chars = text.length;
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  return { words, chars };
}
