/**
 * Run read-modify-write work on one row after every earlier task with the same key settled.
 *
 * The db layer has no cross-dialect transactions (see update-page.ts), so actions that read
 * a JSON column, merge into it and write it back serialize here instead. This closes the
 * window between concurrent calls handled by one server instance — an agent's parallel tool
 * calls, typically — not between separate instances.
 */
const tails = new Map<string, Promise<unknown>>();

export function serializeByKey<T>(key: string, task: () => Promise<T>): Promise<T> {
  const run = (tails.get(key) ?? Promise.resolve()).then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}

if (import.meta.vitest) {
  describe("serializeByKey", () => {
    it("runs tasks with the same key one after the other, even when one fails", async () => {
      const order: string[] = [];
      const slow = serializeByKey("k", async () => {
        order.push("a:start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push("a:end");
        throw new Error("boom");
      });
      const next = serializeByKey("k", async () => {
        order.push("b");
        return 2;
      });
      await expect(slow).rejects.toThrow("boom");
      await expect(next).resolves.toBe(2);
      expect(order).toEqual(["a:start", "a:end", "b"]);
    });
  });
}
