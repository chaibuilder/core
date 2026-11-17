import { describe, expect, it } from "vitest";
import { ActionError } from "~/server/chai-actions/action-error";
import { isChaiMultipartActionRequest, parseChaiMultipartActionBody } from "./parse-multipart-action";

const multipartRequest = (form: FormData) =>
  new Request("https://example.com/admin/api", { method: "POST", body: form });

const createAssetForm = ({
  action = "CREATE_ASSET",
  meta,
  file,
}: {
  action?: string | null;
  meta?: string | null;
  file?: File | string | null;
} = {}) => {
  const form = new FormData();
  if (action !== null) form.append("action", action);
  if (meta !== null && meta !== undefined) form.append("meta", meta);
  if (file === undefined) {
    form.append("file", new File(["png-bytes"], "photo.png", { type: "image/png" }));
  } else if (file !== null) {
    form.append("file", file as any);
  }
  return form;
};

describe("isMultipartActionRequest", () => {
  it("detects a multipart body", () => {
    expect(isChaiMultipartActionRequest(multipartRequest(createAssetForm()))).toBe(true);
  });

  it("rejects a JSON body", () => {
    const req = new Request("https://example.com/admin/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(isChaiMultipartActionRequest(req)).toBe(false);
  });

  it("rejects a request with no content type", () => {
    expect(isChaiMultipartActionRequest(new Request("https://example.com/admin/api"))).toBe(false);
  });
});

describe("parseMultipartActionBody", () => {
  it("returns the same {action, data} shape the JSON transport produces", async () => {
    const form = createAssetForm({ meta: JSON.stringify({ name: "photo.png", optimize: true }) });
    const body = await parseChaiMultipartActionBody(multipartRequest(form));

    expect(body.action).toBe("CREATE_ASSET");
    const data = body.data as Record<string, unknown>;
    expect(data.name).toBe("photo.png");
    expect(data.optimize).toBe(true);
    expect(data.mimeType).toBe("image/png");
    expect(data.file).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(data.file as Uint8Array)).toBe("png-bytes");
  });

  it("falls back to the uploaded file's own name when meta has none", async () => {
    const body = await parseChaiMultipartActionBody(multipartRequest(createAssetForm()));
    expect((body.data as Record<string, unknown>).name).toBe("photo.png");
  });

  it("prefers the meta name over the file name", async () => {
    const form = createAssetForm({ meta: JSON.stringify({ name: "renamed.png" }) });
    const body = await parseChaiMultipartActionBody(multipartRequest(form));
    expect((body.data as Record<string, unknown>).name).toBe("renamed.png");
  });

  it("ignores an empty meta name in favour of the file name", async () => {
    const form = createAssetForm({ meta: JSON.stringify({ name: "" }) });
    const body = await parseChaiMultipartActionBody(multipartRequest(form));
    expect((body.data as Record<string, unknown>).name).toBe("photo.png");
  });

  it("works without a meta part at all", async () => {
    const body = await parseChaiMultipartActionBody(multipartRequest(createAssetForm({ meta: null })));
    expect((body.data as Record<string, unknown>).name).toBe("photo.png");
  });

  it("leaves mimeType undefined when the client reported no usable type", async () => {
    const form = createAssetForm({ file: new File(["bytes"], "photo.png") });
    const body = await parseChaiMultipartActionBody(multipartRequest(form));
    // A typeless part arrives as application/octet-stream, which says nothing
    // about the format and must not be cross-checked against the extension.
    expect((body.data as Record<string, unknown>).mimeType).toBeUndefined();
  });

  it("drops an explicit application/octet-stream type", async () => {
    const form = createAssetForm({
      file: new File(["bytes"], "photo.png", { type: "application/octet-stream" }),
    });
    const body = await parseChaiMultipartActionBody(multipartRequest(form));
    expect((body.data as Record<string, unknown>).mimeType).toBeUndefined();
  });

  it("rejects a request with no action", async () => {
    await expect(parseChaiMultipartActionBody(multipartRequest(createAssetForm({ action: null })))).rejects.toThrow(
      /Missing action/,
    );
  });

  it("rejects a request with no file", async () => {
    await expect(parseChaiMultipartActionBody(multipartRequest(createAssetForm({ file: null })))).rejects.toThrow(
      /Missing file/,
    );
  });

  it("rejects a file part sent as a plain string", async () => {
    await expect(
      parseChaiMultipartActionBody(multipartRequest(createAssetForm({ file: "not-a-file" }))),
    ).rejects.toThrow(/Missing file/);
  });

  it("rejects unparseable meta", async () => {
    await expect(
      parseChaiMultipartActionBody(multipartRequest(createAssetForm({ meta: "{not json" }))),
    ).rejects.toThrow(/Invalid meta/);
  });

  it("rejects meta that is not a JSON object", async () => {
    await expect(parseChaiMultipartActionBody(multipartRequest(createAssetForm({ meta: '["a"]' })))).rejects.toThrow(
      /Invalid meta/,
    );
  });

  it("reports a 400 ActionError so the route answers with the failure envelope", async () => {
    try {
      await parseChaiMultipartActionBody(multipartRequest(createAssetForm({ action: null })));
      throw new Error("expected parseMultipartActionBody to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ActionError);
      expect((error as ActionError).status).toBe(400);
      expect((error as ActionError).code).toBe("BAD_REQUEST");
    }
  });

  it("does not let a meta field overwrite the parsed file bytes", async () => {
    const form = createAssetForm({ meta: JSON.stringify({ file: "malicious-base64", name: "photo.png" }) });
    const body = await parseChaiMultipartActionBody(multipartRequest(form));
    expect((body.data as Record<string, unknown>).file).toBeInstanceOf(Uint8Array);
  });
});
