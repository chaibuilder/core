import type { ChaiBlock } from "~/types/common";

// A hero with a locked navbar inside it, plus a standalone navbar with no flags.
export const LOCKED_NAV_PAGE: ChaiBlock[] = [
  { _id: "hero", _type: "Box" },
  { _id: "nav", _type: "Box", _parent: "hero", _canDelete: false, _canMove: false, _canDuplicate: false },
  { _id: "copy", _type: "Paragraph", _parent: "hero" },
  { _id: "freeNav", _type: "Box" },
];
