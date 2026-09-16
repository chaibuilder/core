import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  getActiveChaiBuilderConfig,
  setActiveChaiBuilderConfig,
} from "~/server/defaults/config-registry";
import type { ResolvedChaiBuilderServerConfig } from "~/server/defaults/types";
import { fake } from "~/tests/setup/fakers";
import { getGlobalAppId } from "~/tests/setup/global-test-app";
import { schema } from "~/tests/setup/test-db";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { UpdatePageAction } from "./update-page";

const originalConfig: ResolvedChaiBuilderServerConfig = getActiveChaiBuilderConfig();

/**
 * `features.revisions` drives draft snapshots — the integration harness
 * registers `revisionsPlugin()` with the defaults (enabled, drafts off), so
 * each test states what it needs. Restored after every test.
 */
function setRevisionsFeature({ enabled = true, drafts }: { enabled?: boolean; drafts: boolean }): void {
  const current = getActiveChaiBuilderConfig();
  setActiveChaiBuilderConfig({
    ...current,
    features: { ...current.features, revisions: { enabled, drafts, maxRevisions: 20 } },
  });
}

const setDraftRevisions = (drafts: boolean): void => setRevisionsFeature({ drafts });

/** MCP/OAuth credentials carry a delegation ceiling; browser sessions don't. */
const MCP_CONTEXT = { userAccess: { role: "mcp", permissions: ["*"] }, delegatedPermissions: ["*"] };

const readRevisions = (db: any, pageId: string) =>
  db
    .select({
      uid: schema.appPagesRevisions.uid,
      type: schema.appPagesRevisions.type,
      currentEditor: schema.appPagesRevisions.currentEditor,
      source: schema.appPagesRevisions.source,
      blocks: schema.appPagesRevisions.blocks,
    })
    .from(schema.appPagesRevisions)
    .where(and(eq(schema.appPagesRevisions.id, pageId), eq(schema.appPagesRevisions.app, getGlobalAppId())));

describe("UpdatePageAction - draft revisions", () => {
  afterEach(() => {
    setActiveChaiBuilderConfig(originalConfig);
  });

  // The parity gap this whole change exists to close: the MCP tools send
  // `{ id, blocks }` with no `addInRevision`, so before the decision moved
  // server-side an agent edit left no trace in revision history.
  it("snapshots a draft for a blocks-only save that never mentions addInRevision", async () => {
    setDraftRevisions(true);
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "From an agent" }] as any,
      });

      const revisions = await readRevisions(db, page.id);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].type).toBe("draft");
      expect((revisions[0].blocks as any)[0].content).toBe("From an agent");
    });
  });

  it("writes no revision when the feature is off, whatever the caller asks for", async () => {
    setDraftRevisions(false);
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "Hello" }] as any,
        // A client asking for a snapshot cannot turn the feature on.
        addInRevision: true,
      });

      expect(await readRevisions(db, page.id)).toHaveLength(0);
    });
  });

  // `drafts` narrows a feature that is already on; it cannot turn one on. A
  // disabled feature whose UI never renders must not accumulate rows.
  it("writes no revision when the feature is disabled, even with drafts turned on", async () => {
    setRevisionsFeature({ enabled: false, drafts: true });
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "Hello" }] as any,
      });

      expect(await readRevisions(db, page.id)).toHaveLength(0);
    });
  });

  it("attributes the revision to the builder for an interactive session", async () => {
    setDraftRevisions(true);
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "Hello" }] as any,
      });

      const revisions = await readRevisions(db, page.id);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].source).toBe("builder");
    });
  });

  it("attributes the revision to mcp when the write came through a delegated credential", async () => {
    setDraftRevisions(true);
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await action(UpdatePageAction, MCP_CONTEXT).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "Hello" }] as any,
      });

      const revisions = await readRevisions(db, page.id);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].source).toBe("mcp");
    });
  });

  it("coalesces consecutive saves by the same editor from the same source", async () => {
    setDraftRevisions(true);
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "First" }] as any,
      });
      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "Second" }] as any,
      });

      const revisions = await readRevisions(db, page.id);
      expect(revisions).toHaveLength(1);
      // The single row carries the latest content, not the first save's.
      expect((revisions[0].blocks as any)[0].content).toBe("Second");
    });
  });

  // An MCP token carries the uid of whoever created it, so `currentEditor`
  // alone cannot separate an agent's edit from that person's own — without
  // `source` in the coalesce key the agent write would merge into their row
  // and inherit its attribution.
  it("keeps a builder save and an agent save by the same person as separate revisions", async () => {
    setDraftRevisions(true);
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "By hand" }] as any,
      });
      await action(UpdatePageAction, MCP_CONTEXT).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "By agent" }] as any,
      });

      const revisions = await readRevisions(db, page.id);
      expect(revisions).toHaveLength(2);
      expect(revisions.map((r: any) => r.source).sort()).toEqual(["builder", "mcp"]);
      // Same person either way — only the source distinguishes them.
      expect(new Set(revisions.map((r: any) => r.currentEditor)).size).toBe(1);
    });
  });
});
