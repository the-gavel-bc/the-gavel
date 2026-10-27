import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import {
  draftJsonbByteLength,
  type DraftFailure,
} from "@/lib/articles/draft-contract/draft-contract";
import { fromEditorDocument } from "@/lib/articles/draft-document/draft-document";
export function insertDraftText(
  view: EditorView,
  text: string,
): DraftFailure | null {
  const failure: DraftFailure = {
    ok: false,
    code: "invalid_input",
    fieldErrors: {
      content:
        "Pasted text exceeds the body limits or supported structure. Nothing was inserted; make a valid body edit to continue.",
    },
  };
  const bytes = draftJsonbByteLength(text);
  if (!view.editable || bytes === null || bytes > 1048576) return failure;
  if (!text) return null;
  // Count before split/model construction: a bounded byte string can contain a million lines.
  let nodes = 2,
    hasText = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index++;
      nodes++;
      hasText = false;
    } else if (!hasText) {
      nodes++;
      hasText = true;
    }
    if (nodes > 5000) return failure;
  }
  try {
    const paragraphs = text
      .split(/\r\n?|\n/u)
      .map((line) =>
        view.state.schema.nodes.paragraph.create(
          null,
          line ? view.state.schema.text(line) : undefined,
        ),
      );
    const transaction = view.state.tr.replaceSelection(
      Slice.maxOpen(Fragment.from(paragraphs)),
    );
    if (!fromEditorDocument(transaction.doc.toJSON()).ok) return failure;
    view.dispatch(transaction);
    return null;
  } catch {
    return failure;
  }
}
