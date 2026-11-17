import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerChaiClientPlugin,
  registerChaiClientPlugins,
  resetChaiClientPluginsForTests,
} from "./register-chai-plugin";

describe("registerChaiClientPlugin", () => {
  afterEach(() => resetChaiClientPluginsForTests());

  it("registers one plugin once, like registerChaiClientPlugins", () => {
    const register = vi.fn();
    registerChaiClientPlugin({ name: "test:one", register });
    registerChaiClientPlugin({ name: "test:one", register });
    registerChaiClientPlugins([{ name: "test:one", register }]);

    expect(register).toHaveBeenCalledTimes(1);
  });
});
