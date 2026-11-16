import type { ReactNode } from "react";
import { registerChaiBlock } from "~/registry";
import type { ChaiBlockConfig } from "~/types/blocks";

const TestBlock = ({
  children,
  blockProps,
  ...props
}: {
  children?: ReactNode;
  blockProps?: object;
  _type?: string;
}) => (
  <div data-test-block={props._type} {...blockProps}>
    {children}
  </div>
);

/**
 * Registers plain container blocks in the real registry. Call at module scope of the test file:
 * the registry is module-global (vitest isolates it per file), and its per-type memo caches mean a
 * type must not be re-registered with a different config inside one file.
 * Files that need the real built-in blocks call `loadWebBlocks()` from `~/web-blocks` instead.
 */
export function registerTestBlocks(...types: (string | ({ type: string } & Partial<ChaiBlockConfig>))[]): void {
  for (const entry of types) {
    const config = typeof entry === "string" ? { type: entry } : entry;
    registerChaiBlock(TestBlock as any, { label: config.type, group: "test", ...config } as any);
  }
}
