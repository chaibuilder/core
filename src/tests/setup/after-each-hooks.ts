/**
 * Resets registered by harness modules that are loaded on demand (e.g. chai-config.ts), run by
 * server-env.ts after every test. Keeps heavy modules out of files that never import them.
 */
const hooks: (() => void | Promise<void>)[] = [];

export function registerHarnessAfterEach(hook: () => void | Promise<void>): void {
  if (!hooks.includes(hook)) hooks.push(hook);
}

export async function runHarnessAfterEach(): Promise<void> {
  for (const hook of hooks) await hook();
}
