import { afterAll, afterEach, beforeAll } from "vitest";
import { mswServer } from "../builder/msw";

// consola is configured by consola-setup.ts, which runs first (see vitest.config.ts).

beforeAll(() => mswServer.listen({ onUnhandledRequest: "warn" }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

// `~/server/only-server` throws when `window` exists, so DOM (happy-dom) test files never load the
// server half. Node files get the real in-memory database; DOM files get the real builder runtime.
if (typeof window === "undefined") {
  await import("./server-env");
} else {
  await import("./client-env");
}
