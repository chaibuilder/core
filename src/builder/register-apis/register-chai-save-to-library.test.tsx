/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/react";
import {
  registerChaiSaveToLibrary,
  resetChaiSaveToLibraryForTests,
  useRegisteredChaiSaveToLibrary,
} from "~/builder/register-apis/register-chai-save-to-library";

describe("save-to-library", () => {
  beforeEach(() => {
    resetChaiSaveToLibraryForTests();
  });

  describe("registerSaveToLibrary", () => {
    it("should register a component", () => {
      const MockComponent = vi.fn(() => null);
      registerChaiSaveToLibrary(MockComponent);
      const { result } = renderHook(() => useRegisteredChaiSaveToLibrary());
      expect(result.current).toBe(MockComponent);
    });
  });

  describe("useSaveToLibraryComponent", () => {
    it("should return null when no component is registered", () => {
      const { result } = renderHook(() => useRegisteredChaiSaveToLibrary());
      expect(result.current).toBeNull();
    });

    it("should return registered component", () => {
      const MockComponent = vi.fn(() => null);
      registerChaiSaveToLibrary(MockComponent);
      const { result } = renderHook(() => useRegisteredChaiSaveToLibrary());
      expect(result.current).toBe(MockComponent);
    });
  });
});
