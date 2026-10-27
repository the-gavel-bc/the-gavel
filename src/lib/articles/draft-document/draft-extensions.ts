import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import HardBreak from "@tiptap/extension-hard-break";
import { BulletList, OrderedList, ListItem } from "@tiptap/extension-list";
import { isValidDraftLink } from "../draft-contract/draft-contract";
import { DRAFT_LINK_ATTRIBUTES } from "./draft-document";
export function createDraftExtensions() {
  return [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [2, 3] }),
    Blockquote,
    BulletList,
    OrderedList,
    ListItem,
    Bold,
    Italic,
    HardBreak.configure({ keepMarks: false }),
    Link.configure({
      autolink: false,
      linkOnPaste: false,
      openOnClick: false,
      HTMLAttributes: DRAFT_LINK_ATTRIBUTES,
      isAllowedUri: (href) => isValidDraftLink(href),
    }),
  ];
}
