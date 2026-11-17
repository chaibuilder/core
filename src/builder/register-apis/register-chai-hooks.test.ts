import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAI_HOOKS } from "../../constants/CHAI_HOOKS";
import { unregisterChaiHooks, runChaiHooks, getRegisteredChaiHooks, registerChaiHook } from "./register-chai-hooks";

describe("register-chai-hooks", () => {
  beforeEach(() => {
    unregisterChaiHooks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("CHAI_HOOKS", () => {
    it("should export the expected hook constants", () => {
      expect(CHAI_HOOKS.BEFORE_SAVE_PAGE).toBe("before:save:page");
      expect(CHAI_HOOKS.AFTER_SAVE_PAGE).toBe("after:save:page");
    });
  });

  describe("registerChaiHook", () => {
    it("should register a hook function", () => {
      const hookFn = vi.fn((data) => data);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hookFn);
      const hooks = getRegisteredChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE);
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hookFn);
    });

    it("should allow multiple hooks to be registered to the same hook name", () => {
      const hook1 = vi.fn((data) => data);
      const hook2 = vi.fn((data) => data);
      const hook3 = vi.fn((data) => data);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook1);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook2);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook3);
      const hooks = getRegisteredChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE);
      expect(hooks).toHaveLength(3);
      expect(hooks[0]).toBe(hook1);
      expect(hooks[1]).toBe(hook2);
      expect(hooks[2]).toBe(hook3);
    });

    it("should register hooks to different hook names independently", () => {
      const beforeHook = vi.fn((data) => data);
      const afterHook = vi.fn((data) => data);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, beforeHook);
      registerChaiHook(CHAI_HOOKS.AFTER_SAVE_PAGE, afterHook);
      expect(getRegisteredChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE)).toHaveLength(1);
      expect(getRegisteredChaiHooks(CHAI_HOOKS.AFTER_SAVE_PAGE)).toHaveLength(1);
    });

    it("should support custom hook names", () => {
      const hookFn = vi.fn((data) => data);
      registerChaiHook("custom:hook", hookFn);
      const hooks = getRegisteredChaiHooks("custom:hook");
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hookFn);
    });
  });

  describe("executeChaiHooks", () => {
    it("should return original data when no hooks registered", async () => {
      const data = { value: 42 };
      const result = await runChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, data);
      expect(result).toEqual(data);
    });

    it("should execute a single hook and return transformed data", async () => {
      const hookFn = vi.fn((data) => ({ ...data, modified: true }));
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hookFn);
      const data = { value: 42 };
      const result = await runChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, data);
      expect(hookFn).toHaveBeenCalledWith(data, undefined);
      expect(result).toEqual({ value: 42, modified: true });
    });

    it("should execute multiple hooks in pipeline order", async () => {
      const hook1 = vi.fn((data) => ({ ...data, step1: true }));
      const hook2 = vi.fn((data) => ({ ...data, step2: true }));
      const hook3 = vi.fn((data) => ({ ...data, step3: true }));
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook1);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook2);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook3);

      const data = { value: 42 };
      const result = await runChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, data);

      expect(hook1).toHaveBeenCalledWith(data, undefined);
      expect(hook2).toHaveBeenCalledWith({ value: 42, step1: true }, undefined);
      expect(hook3).toHaveBeenCalledWith({ value: 42, step1: true, step2: true }, undefined);
      expect(result).toEqual({ value: 42, step1: true, step2: true, step3: true });
    });

    it("should pass context to all hooks", async () => {
      const hook1 = vi.fn((data, _context) => data);
      const hook2 = vi.fn((data, _context) => data);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook1);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook2);

      const data = { value: 42 };
      const context = { pageId: "page-123", operation: "update" as const };
      await runChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, data, context);

      expect(hook1).toHaveBeenCalledWith(data, context);
      expect(hook2).toHaveBeenCalledWith(data, context);
    });

    it("should handle async hooks", async () => {
      const asyncHook = vi.fn(async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ...data, async: true };
      });
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, asyncHook);

      const data = { value: 42 };
      const result = await runChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, data);

      expect(asyncHook).toHaveBeenCalled();
      expect(result).toEqual({ value: 42, async: true });
    });

    it("should continue pipeline if a hook throws an error", async () => {
      const hook1 = vi.fn((data) => ({ ...data, step1: true }));
      const errorHook = vi.fn(() => {
        throw new Error("Hook error");
      });
      const hook3 = vi.fn((data) => ({ ...data, step3: true }));

      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook1);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, errorHook);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook3);

      const data = { value: 42 };
      const result = await runChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, data);

      expect(hook1).toHaveBeenCalled();
      expect(errorHook).toHaveBeenCalled();
      expect(hook3).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("before:save:page"), expect.any(Error));
      // Result should have step1 and step3, but not be broken by error
      expect(result).toEqual({ value: 42, step1: true, step3: true });
    });

    it("should handle async hook errors", async () => {
      const hook1 = vi.fn((data) => ({ ...data, step1: true }));
      const asyncErrorHook = vi.fn(async () => {
        throw new Error("Async error");
      });
      const hook3 = vi.fn((data) => ({ ...data, step3: true }));

      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook1);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, asyncErrorHook);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook3);

      const data = { value: 42 };
      const result = await runChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, data);

      expect(console.error).toHaveBeenCalled();
      expect(result).toEqual({ value: 42, step1: true, step3: true });
    });

    it("should work with array data", async () => {
      const hook1 = vi.fn((blocks) => [...blocks, { id: "new-block" }]);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook1);

      const blocks = [{ id: "block-1" }, { id: "block-2" }];
      const result = await runChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, blocks);

      expect(result).toHaveLength(3);
      expect(result[2]).toEqual({ id: "new-block" });
    });
  });

  describe("clearHooks", () => {
    it("should clear hooks for a specific hook name", () => {
      const hook1 = vi.fn((data) => data);
      const hook2 = vi.fn((data) => data);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook1);
      registerChaiHook(CHAI_HOOKS.AFTER_SAVE_PAGE, hook2);

      unregisterChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE);

      expect(getRegisteredChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE)).toHaveLength(0);
      expect(getRegisteredChaiHooks(CHAI_HOOKS.AFTER_SAVE_PAGE)).toHaveLength(1);
    });

    it("should clear all hooks when no hook name provided", () => {
      const hook1 = vi.fn((data) => data);
      const hook2 = vi.fn((data) => data);
      registerChaiHook(CHAI_HOOKS.BEFORE_SAVE_PAGE, hook1);
      registerChaiHook(CHAI_HOOKS.AFTER_SAVE_PAGE, hook2);

      unregisterChaiHooks();

      expect(getRegisteredChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE)).toHaveLength(0);
      expect(getRegisteredChaiHooks(CHAI_HOOKS.AFTER_SAVE_PAGE)).toHaveLength(0);
    });
  });
});
