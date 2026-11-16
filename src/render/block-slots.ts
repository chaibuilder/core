import { get, uniq } from "lodash-es";
import { getRegisteredChaiBlock } from "~/registry";

// `children` is the default slot, not a named one: React would overwrite a `children` prop.
const slotOf = (block: { _slot?: string }) => (block._slot && block._slot !== "children" ? block._slot : undefined);

// No slot means the block renders as part of the parent's `children`.
export const matchesBlockSlot = (block: { _slot?: string }, blockSlot?: string) => slotOf(block) === blockSlot;

// The named slots a block's children fill, in document order.
export const getBlockSlots = (children: { _slot?: string }[]) =>
  uniq(children.map(slotOf).filter((key): key is string => !!key));

export type ChaiSlotRule = { title?: string; accept?: RegExp };

// The `chaiSlot()` prop a block type declares under this key, if any.
export const getSlotRule = (ownerType: string | undefined, slotKey: string | undefined): ChaiSlotRule | undefined => {
  if (!ownerType || !slotKey) return undefined;
  const prop = get(getRegisteredChaiBlock(ownerType), ["props", "schema", "properties", slotKey]);
  if (!prop?.slot) return undefined;
  const accept = typeof prop.acceptSource === "string" ? new RegExp(prop.acceptSource, prop.acceptFlags) : undefined;
  return { title: prop.title, accept };
};

// String.search ignores lastIndex and /g, so the same check always gives the same answer.
export const matchesAccept = (accept: RegExp | undefined, type: string) => !accept || type.search(accept) !== -1;
