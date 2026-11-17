import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectChaiFetchInterceptorHeaders,
  getRegisteredChaiFetchInterceptors,
  runChaiFetchInterceptors,
  registerChaiFetchInterceptor,
  resetChaiFetchInterceptorsForTests,
} from "./register-chai-fetch-interceptor";

afterEach(() => {
  resetChaiFetchInterceptorsForTests();
  vi.restoreAllMocks();
});

describe("registerChaiFetchInterceptor", () => {
  it("is keyed by name so re-registration replaces instead of duplicating", () => {
    registerChaiFetchInterceptor("chai:test", { headers: () => ({ "x-a": "1" }) });
    registerChaiFetchInterceptor("chai:test", { headers: () => ({ "x-b": "2" }) });

    expect(getRegisteredChaiFetchInterceptors()).toHaveLength(1);
    expect(collectChaiFetchInterceptorHeaders({ action: "GET_PAGES" })).toEqual({ "x-b": "2" });
  });

  it("merges headers from every interceptor and passes the action along", () => {
    const first = vi.fn(() => ({ "x-first": "1", "x-shared": "first" }));
    const second = vi.fn(() => ({ "x-shared": "second" }));
    registerChaiFetchInterceptor("chai:first", { headers: first });
    registerChaiFetchInterceptor("chai:second", { headers: second });

    expect(collectChaiFetchInterceptorHeaders({ action: "GET_PAGES" })).toEqual({
      "x-first": "1",
      "x-shared": "second",
    });
    expect(first).toHaveBeenCalledWith({ action: "GET_PAGES" });
  });

  it("logs and skips an interceptor that throws, in headers() and onResponse()", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen = vi.fn();
    registerChaiFetchInterceptor("chai:broken", {
      headers: () => {
        throw new Error("headers boom");
      },
      onResponse: () => {
        throw new Error("response boom");
      },
    });
    registerChaiFetchInterceptor("chai:ok", { headers: () => ({ "x-ok": "1" }), onResponse: seen });

    expect(collectChaiFetchInterceptorHeaders({ action: "A" })).toEqual({ "x-ok": "1" });
    runChaiFetchInterceptors({ action: "A", status: 200, body: { ok: true } });

    expect(seen).toHaveBeenCalledWith({ action: "A", status: 200, body: { ok: true } });
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("treats a null or missing headers() result as no headers", () => {
    registerChaiFetchInterceptor("chai:null", { headers: () => null });
    registerChaiFetchInterceptor("chai:none", { onResponse: () => {} });

    expect(collectChaiFetchInterceptorHeaders({ action: "A" })).toEqual({});
  });
});
