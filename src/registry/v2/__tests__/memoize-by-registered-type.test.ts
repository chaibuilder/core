import { describe, expect, it } from "vitest";
import { memoizeByRegisteredType, registerChaiBlock, registerMemoizedBlockGetter } from "~/registry";

const Component = () => null;

const registerBlock = (type: string) => registerChaiBlock(Component, { type, label: type, group: "test" });

// getBlockRuntimeProps (in the render-helper module) opts into the registry's
// memo-invalidation through registerMemoizedBlockGetter rather than living in
// the MEMOIZED_BLOCK_GETTERS initial entries. Exercise that hook directly with a
// stand-in getter so the assertions are independent of the render-prop schema.
describe("memoizeByRegisteredType / registerMemoizedBlockGetter", () => {
  it("bypasses the cache while unregistered, memoizes once registered, and evicts on re-registration", () => {
    const type = "TestMemoizeByRegisteredType";
    let computations = 0;
    const getter = memoizeByRegisteredType(() => ++computations);
    registerMemoizedBlockGetter("testGetter", getter);

    // (1) unregistered: never cached, so it recomputes on every call.
    expect(getter(type)).not.toBe(getter(type));

    registerBlock(type);
    // (2) registered: memoized.
    const cached = getter(type);
    expect(getter(type)).toBe(cached);

    registerBlock(type);
    // (3) re-registration evicts the entry, so it recomputes.
    expect(getter(type)).not.toBe(cached);
  });

  it("re-registering under the same name replaces the old getter instead of retaining it", () => {
    const type = "TestNamedGetterReplace";
    let a = 0;
    let b = 0;
    const first = memoizeByRegisteredType(() => ++a);
    const second = memoizeByRegisteredType(() => ++b);

    registerMemoizedBlockGetter("testReplacedGetter", first);
    registerBlock(type);
    const firstCached = first(type);

    // Simulates an HMR reload re-creating the helper: same name, new function.
    registerMemoizedBlockGetter("testReplacedGetter", second);
    const secondCached = second(type);

    registerBlock(type); // registry mutation sweeps registered getters
    expect(second(type)).not.toBe(secondCached); // live getter evicted
    expect(first(type)).toBe(firstCached); // replaced getter no longer swept
  });
});
