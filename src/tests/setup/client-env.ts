import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
// Real i18next + react-i18next with the English bundle: `t(key)` renders the en.json text.
import "~/builder/core/locales/load";
import { resetBuilderStore, trackBuilderStoreWrites } from "../builder/reset-builder-store";

// happy-dom gaps that Radix primitives (~/components/ui) touch while rendering.
const g = globalThis as any;
g.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
const elementProto = g.Element?.prototype;
if (elementProto) {
  elementProto.hasPointerCapture ??= () => false;
  elementProto.setPointerCapture ??= () => {};
  elementProto.releasePointerCapture ??= () => {};
  elementProto.scrollIntoView ??= () => {};
}

trackBuilderStoreWrites();

afterEach(() => {
  cleanup();
  resetBuilderStore();
});
