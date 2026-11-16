import { forEach, get, isArray, isEmpty, isString, keys, startsWith } from "lodash-es";
import { COLLECTION_PREFIX } from "~/constants/STRINGS";
import { resolveStringBinding } from "~/render/binding-engine";
import { ChaiBlock } from "~/types/common";

// Copy-on-write: returns the input identity untouched when no binding resolves anywhere
// inside it, and rebuilds only the branches that actually changed. Never mutates its input.
const applyBindingToValue = (
  value: any,
  pageExternalData: Record<string, any>,
  { index, key: repeaterKey, locale, itemKey }: { index: number; key: string; locale?: string; itemKey?: string },
  propertyKey?: string,
): any => {
  if (isString(value)) {
    // resolveStringBinding returns the input string as-is when it has no {{...}} placeholder.
    return resolveStringBinding(value, pageExternalData, index, repeaterKey, propertyKey, locale, itemKey ?? "");
  }

  if (isArray(value)) {
    let changed = false;
    const result = value.map((item) => {
      const next = applyBindingToValue(item, pageExternalData, { index, key: repeaterKey, locale, itemKey }, propertyKey);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? result : value;
  }

  if (value && typeof value === "object") {
    let changed = false;
    const result: Record<string, any> = {};
    forEach(keys(value), (key) => {
      const current = (value as Record<string, any>)[key];
      if (!startsWith(key, "_") && key !== "$repeaterItemsKey") {
        const next = applyBindingToValue(current, pageExternalData, { index, key: repeaterKey, locale, itemKey }, key);
        if (next !== current) changed = true;
        result[key] = next;
      } else {
        result[key] = current;
      }
    });
    return changed ? result : value;
  }

  return value;
};

export const applyBindingToBlockProps = (
  blockChai: ChaiBlock,
  pageExternalData: Record<string, any>,
  { index, key: repeaterKey, locale, itemKey }: { index: number; key: string; locale?: string; itemKey?: string },
) => {
  // applyBindingToValue is copy-on-write and never mutates, so the only mutation shield
  // needed is a shallow copy for the top-level repeaterItems rewrites below.
  let block = blockChai;
  if (block.repeaterItems) {
    block = { ...blockChai };
    const originalRepeaterItemsBinding = block.repeaterItems;
    block.$repeaterItemsKey = block.repeaterItems;
    if (startsWith(block.repeaterItems, `{{${COLLECTION_PREFIX}`)) {
      block.$repeaterItemsKey = block.repeaterItems = `${block.repeaterItems.replace("}}", `/${block._id}}}`)}`;
    }
    if (!isEmpty(block.repeaterItems) && block.pagination) {
      const totalItemsBinding = `${originalRepeaterItemsBinding.replace("}}", `/${block._id}/totalItems}}`)}`;
      const resolvedTotalItems = get(pageExternalData, totalItemsBinding.slice(2, -2));
      block.repeaterTotalItems = resolvedTotalItems;
      block.totalItems = resolvedTotalItems;
    }
  }
  return applyBindingToValue(block, pageExternalData, {
    index,
    key: repeaterKey,
    locale,
    itemKey,
  });
};

if (import.meta.vitest) {
  describe("applyBindingToValue", () => {
    it("should handle string values with bindings", () => {
      const value = "Hello {{user.name}}";
      const pageExternalData = { user: { name: "John" } };
      const result = applyBindingToValue(value, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toBe("Hello John");
    });

    it("should handle nested object properties", () => {
      const value = {
        name: "John",
        address: {
          city: "{{user.city}}",
          street: "123 Main St",
        },
      };
      const pageExternalData = { user: { city: "New York" } };
      const result = applyBindingToValue(value, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toEqual({
        name: "John",
        address: {
          city: "New York",
          street: "123 Main St",
        },
      });
    });

    it("should handle arrays of values", () => {
      const value = ["Hello {{user.name}}", "Welcome {{user.role}}"];
      const pageExternalData = { user: { name: "John", role: "Admin" } };
      const result = applyBindingToValue(value, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toEqual(["Hello John", "Welcome Admin"]);
    });

    it("should handle $index binding in repeater context", () => {
      const value = "Item {{$index}}";
      const pageExternalData = { items: ["a", "b", "c"] };
      const result = applyBindingToValue(value, pageExternalData, {
        index: 1,
        key: "{{items}}",
      });
      expect(result).toBe("Item b");
    });

    it("should handle $index binding with dot notation", () => {
      const value = "Item {{$index.value}}";
      const pageExternalData = {
        items: [{ value: "apple" }, { value: "banana" }, { value: "cherry" }],
      };
      const result = applyBindingToValue(value, pageExternalData, {
        index: 1,
        key: "{{items}}",
      });
      expect(result).toBe("Item banana");
    });

    it("should return an empty string for non-existing bindings", () => {
      const value = "Hello {{user.nonexistent}}";
      const pageExternalData = { user: { name: "John" } };
      const result = applyBindingToValue(value, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toBe("Hello ");
    });

    it("should preserve private properties starting with _", () => {
      const value = {
        name: "John",
        _private: "secret",
      };
      const result = applyBindingToValue(value, {}, { index: -1, key: "" });
      expect(result).toEqual({
        name: "John",
        _private: "secret",
      });
    });

    it("should completely replace image property value when binding exists", () => {
      const value = {
        image: "https://default.jpg{{user.avatar}}",
        title: "Hello {{user.name}}",
      };
      const pageExternalData = {
        user: { avatar: "https://avatar.jpg", name: "John" },
      };
      const result = applyBindingToValue(value, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toEqual({
        image: "https://avatar.jpg", // Completely replaced, not concatenated
        title: "Hello John", // Normal replacement
      });
    });

    it("should completely replace mobileImage property value when binding exists", () => {
      const value = {
        mobileImage: "https://default-mobile.jpg{{user.mobileAvatar}}",
        alt: "Avatar for {{user.name}}",
      };
      const pageExternalData = {
        user: { mobileAvatar: "https://mobile-avatar.jpg", name: "John" },
      };
      const result = applyBindingToValue(value, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toEqual({
        mobileImage: "https://mobile-avatar.jpg", // Completely replaced
        alt: "Avatar for John", // Normal replacement
      });
    });

    it("should handle image binding with only binding syntax", () => {
      const value = {
        image: "{{product.thumbnail}}",
      };
      const pageExternalData = { product: { thumbnail: "https://product.jpg" } };
      const result = applyBindingToValue(value, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toEqual({
        image: "https://product.jpg",
      });
    });

    it("should not affect non-image properties with similar bindings", () => {
      const value = {
        url: "https://default.com{{page.slug}}",
        link: "https://example.com/{{page.id}}",
      };
      const pageExternalData = { page: { slug: "/about", id: "123" } };
      const result = applyBindingToValue(value, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toEqual({
        url: "https://default.com/about", // Concatenated normally
        link: "https://example.com/123", // Concatenated normally
      });
    });
  });

  describe("applyBindingToBlockProps", () => {
    it("should handle basic block with bindings", () => {
      const block: ChaiBlock = {
        _id: "test-block",
        _type: "text",
        type: "text",
        content: "Hello {{user.name}}",
        style: {
          color: "{{theme.color}}",
        },
      };
      const pageExternalData = {
        user: { name: "John" },
        theme: { color: "blue" },
      };
      const result = applyBindingToBlockProps(block, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toEqual({
        _id: "test-block",
        _type: "text",
        type: "text",
        content: "Hello John",
        style: {
          color: "blue",
        },
      });
    });

    it("should handle repeaterItems and repeaterItemsBinding", () => {
      const block: ChaiBlock = {
        _id: "test-block",
        _type: "repeater",
        type: "repeater",
        repeaterItems: "{{items}}",
        items: ["a", "b", "c"],
      };
      const pageExternalData = { items: ["x", "y", "z"] };
      const result = applyBindingToBlockProps(block, pageExternalData, {
        index: -1,
        key: "",
      });
      expect(result).toEqual({
        _id: "test-block",
        _type: "repeater",
        type: "repeater",
        $repeaterItemsKey: "{{items}}",
        repeaterItems: ["x", "y", "z"],
        items: ["a", "b", "c"],
      });
    });

    it("should handle nested blocks with bindings", () => {
      const block: ChaiBlock = {
        _id: "test-block",
        _type: "container",
        type: "container",
        children: [
          {
            _id: "child-block",
            _type: "text",
            type: "text",
            content: "Item {{$index}}",
            style: {
              color: "{{theme.color}}",
            },
          },
        ],
      };
      const pageExternalData = {
        theme: { color: "red" },
        items: ["x", "y", "z"],
      };
      const result = applyBindingToBlockProps(block, pageExternalData, {
        index: 2,
        key: "{{items}}",
      });
      expect(result).toEqual({
        _id: "test-block",
        _type: "container",
        type: "container",
        children: [
          {
            _id: "child-block",
            _type: "text",
            type: "text",
            content: "Item z",
            style: {
              color: "red",
            },
          },
        ],
      });
    });

    it("should handle arrays of blocks", () => {
      const block: ChaiBlock = {
        _id: "test-block",
        _type: "list",
        type: "list",
        items: [
          { _id: "item1", content: "Item {{$index}}" },
          { _id: "item2", content: "Item {{$index}}" },
        ],
      };
      const pageExternalData = { items: ["x", "y", "z"] };
      const result = applyBindingToBlockProps(block, pageExternalData, {
        index: 0,
        key: "{{items}}",
      });
      expect(result).toEqual({
        _id: "test-block",
        _type: "list",
        type: "list",
        items: [
          { _id: "item1", content: "Item x" },
          { _id: "item2", content: "Item x" },
        ],
      });
    });

    it("should resolve paginated collection totalItems from flat pageExternalData keys", () => {
      const block: ChaiBlock = {
        _id: "test-block",
        _type: "repeater",
        type: "repeater",
        repeaterItems: "{{#articles}}",
        pagination: true,
      };
      const pageExternalData = {
        "#articles/test-block": [{ title: "Hello" }],
        "#articles/test-block/totalItems": 42,
      };
      const result = applyBindingToBlockProps(block, pageExternalData, {
        index: -1,
        key: "",
      });

      expect(result.repeaterItems).toEqual([{ title: "Hello" }]);
      expect(result.$repeaterItemsKey).toBe("{{#articles/test-block}}");
      expect(result.repeaterTotalItems).toBe(42);
      expect(result.totalItems).toBe(42);
    });

    it("should resolve $item bindings against the collection item key", () => {
      const block: ChaiBlock = {
        _id: "child-block",
        _type: "Heading",
        content: "By {{$item.name}}",
      };
      const pageExternalData = {
        "#agents/blk1": [{ name: "Ann" }],
      };
      const result = applyBindingToBlockProps(block, pageExternalData, {
        index: -1,
        key: "",
        itemKey: "#agents/blk1.0",
      });
      expect(result.content).toBe("By Ann");
    });

    it("should resolve $item and $index independently in the same block", () => {
      const block: ChaiBlock = {
        _id: "child-block",
        _type: "Heading",
        content: "{{$item.name}}: {{$index.title}}",
      };
      const pageExternalData = {
        "#agents/blk1": [{ name: "Ann" }],
        "#listings/blk2": [{ title: "First" }, { title: "Second" }],
      };
      const result = applyBindingToBlockProps(block, pageExternalData, {
        index: 1,
        key: "{{#listings/blk2}}",
        itemKey: "#agents/blk1.0",
      });
      expect(result.content).toBe("Ann: Second");
    });

    it("should return the exact input identity when the block has no bindings", () => {
      const block: ChaiBlock = {
        _id: "static-block",
        _type: "text",
        content: "Hello world",
        style: { color: "blue" },
        items: ["a", "b"],
      };
      const result = applyBindingToBlockProps(block, { user: { name: "John" } }, { index: -1, key: "" });
      expect(result).toBe(block);
      expect(result.style).toBe(block.style);
      expect(result.items).toBe(block.items);
    });

    it("should not mutate the input block and keep unbound sub-object identities when bindings resolve", () => {
      const style = { color: "blue" };
      const block: ChaiBlock = {
        _id: "test-block",
        _type: "text",
        content: "Hello {{user.name}}",
        style,
      };
      const snapshot = JSON.parse(JSON.stringify(block));
      const result = applyBindingToBlockProps(block, { user: { name: "John" } }, { index: -1, key: "" });
      expect(result).not.toBe(block);
      expect(result.content).toBe("Hello John");
      expect(result.style).toBe(style);
      expect(block).toEqual(snapshot);
    });

    it("should not mutate the input block when rewriting repeaterItems", () => {
      const block: ChaiBlock = {
        _id: "test-block",
        _type: "repeater",
        repeaterItems: "{{#articles}}",
        pagination: true,
      };
      const snapshot = JSON.parse(JSON.stringify(block));
      const result = applyBindingToBlockProps(
        block,
        { "#articles/test-block": [{ title: "Hello" }], "#articles/test-block/totalItems": 42 },
        { index: -1, key: "" },
      );
      expect(result).not.toBe(block);
      expect(result.repeaterItems).toEqual([{ title: "Hello" }]);
      expect(block).toEqual(snapshot);
    });

    it("should leave missing paginated collection totalItems undefined for renderer fallback", () => {
      const block: ChaiBlock = {
        _id: "test-block",
        _type: "repeater",
        type: "repeater",
        repeaterItems: "{{#articles}}",
        pagination: true,
      };
      const pageExternalData = {
        "#articles/test-block": [{ title: "Hello" }],
      };
      const result = applyBindingToBlockProps(block, pageExternalData, {
        index: -1,
        key: "",
      });

      expect(result.repeaterTotalItems).toBeUndefined();
      expect(result.totalItems).toBeUndefined();
    });
  });
}
