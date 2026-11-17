import { describe, expect, it, vi } from "vitest";
import type { ChaiHttpActionBody } from "~/server/chai-builder/handle-http-action";
import { handleChaiActionRequest } from "./handle-action-request";

const okHandler = () =>
  vi.fn(async (_body: ChaiHttpActionBody) => Response.json({ ok: true, data: { id: "asset-1" } }));

describe("handleChaiActionRequest", () => {
  it("dispatches ordinary JSON actions", async () => {
    const handler = okHandler();
    const request = new Request("https://example.com/admin/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "GET_ASSETS", data: { page: 1 } }),
    });

    const response = await handleChaiActionRequest(request, handler);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith({ action: "GET_ASSETS", data: { page: 1 } });
  });

  it("normalizes multipart asset uploads before dispatch", async () => {
    const handler = okHandler();
    const form = new FormData();
    form.append("action", "CREATE_ASSET");
    form.append("meta", JSON.stringify({ name: "Screenshot\u202fAM.png", optimize: true }));
    form.append("file", new File(["png-bytes"], "Screenshot\u202fAM.png", { type: "image/png" }));
    const request = new Request("https://example.com/admin/api", { method: "POST", body: form });

    const response = await handleChaiActionRequest(request, handler);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    const body = handler.mock.calls[0]![0];
    expect(body.action).toBe("CREATE_ASSET");
    expect(body.data).toMatchObject({
      name: "Screenshot\u202fAM.png",
      optimize: true,
      mimeType: "image/png",
    });
    expect((body.data as { file: unknown }).file).toBeInstanceOf(Uint8Array);
  });

  it("returns the standard 400 envelope for malformed multipart", async () => {
    const handler = okHandler();
    const form = new FormData();
    form.append("action", "CREATE_ASSET");
    const request = new Request("https://example.com/admin/api", { method: "POST", body: form });

    const response = await handleChaiActionRequest(request, handler);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST", status: 400 },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns a 400 instead of a JSON parser 500 for malformed JSON", async () => {
    const handler = okHandler();
    const request = new Request("https://example.com/admin/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "--not-json",
    });

    const response = await handleChaiActionRequest(request, handler);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST", message: "Malformed JSON request body", status: 400 },
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
