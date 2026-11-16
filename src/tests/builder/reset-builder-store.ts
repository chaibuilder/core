import { atom as createAtom, type Atom, type WritableAtom } from "jotai";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import {
  chaiBuilderPropsAtom,
  chaiDesignTokensAtom,
  chaiExternalDataAtom,
  chaiPageExternalDataAtom,
} from "~/builder/atoms/builder";
import { builderStore } from "~/builder/atoms/store";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import { selectedLanguageAtom } from "~/builder/hooks/use-languages";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { chaiThemeValuesAtom } from "~/builder/hooks/use-theme";
import { pagesPropsAtom, serverConfigAtom } from "~/builder/pages/hooks/utils/use-pages-props";

type ResettableAtom = WritableAtom<unknown, [unknown], unknown> & { init: unknown };

// Primitive atoms (`atom(initialValue)`) share jotai's default write; derived and write-only
// callback atoms (`atom(null, fn)`) also carry `init` but must never be "reset" by calling them.
const PRIMITIVE_WRITE = (createAtom(0) as ResettableAtom).write;
const isPrimitiveAtom = (atom: Atom<unknown>): atom is ResettableAtom =>
  "init" in atom && (atom as Partial<ResettableAtom>).write === PRIMITIVE_WRITE;

/** Atoms the builder hydrates from props; always reset even if nothing wrote them through the store. */
const KNOWN_ATOMS = [
  chaiBuilderPropsAtom,
  chaiDesignTokensAtom,
  chaiExternalDataAtom,
  chaiPageExternalDataAtom,
  presentBlocksAtom,
  selectedBlockIdsAtom,
  isPageLoadedAtom,
  selectedLanguageAtom,
  chaiThemeValuesAtom,
  pagesPropsAtom,
  serverConfigAtom,
] as Atom<unknown>[];

const written = new Set<ResettableAtom>();
let tracking = false;

/**
 * The builder uses jotai's default store (`builderStore`) with no Provider, so state written by one
 * test is visible to the next test in the same file. Record every primitive atom written through
 * the store — by the test or by the component under test — so it can be put back afterwards.
 */
export function trackBuilderStoreWrites(): void {
  if (tracking) return;
  tracking = true;
  const originalSet = builderStore.set.bind(builderStore);
  builderStore.set = (atom: Atom<unknown>, ...args: unknown[]) => {
    if (isPrimitiveAtom(atom)) written.add(atom);
    return originalSet(atom, ...args);
  };
}

/** Writes every tracked or known primitive atom back to its initial value. */
export function resetBuilderStore(): void {
  const atoms = new Set<ResettableAtom>(written);
  for (const atom of KNOWN_ATOMS) {
    if (isPrimitiveAtom(atom)) atoms.add(atom);
  }
  written.clear();
  for (const atom of atoms) {
    builderStore.set(atom, atom.init);
  }
  written.clear();
}
