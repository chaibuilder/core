import type { ConsolaReporter, LogObject, LogType } from "consola";

const listeners = new Set<(logObj: LogObject) => void>();

/**
 * The only reporter consola has under test (installed by `src/tests/setup/consola-setup.ts`).
 * Tagged loggers copy the root's reporter list when they are created, so routing through this one
 * reporter reaches every logger regardless of when it was created or when capture started.
 */
export const consolaFanOutReporter: ConsolaReporter = {
  log: (logObj) => {
    for (const listener of listeners) listener(logObj);
  },
};

export type ConsolaCapture = {
  records: LogObject[];
  /** Rendered messages (args joined by a space) for one log type, optionally filtered by tag. */
  messages: (type: LogType, tag?: string) => string[];
  /** True when some message of `type` contains `needle` (string) or matches it (RegExp). */
  has: (type: LogType, needle: string | RegExp, tag?: string) => boolean;
  /** Forget what was recorded so far (e.g. in `afterEach`). */
  clear: () => void;
  restore: () => void;
};

/** Records real consola output from every logger, at every level, from now until `restore()`. */
export function captureConsola(): ConsolaCapture {
  const records: LogObject[] = [];
  const listener = (logObj: LogObject) => {
    records.push(logObj);
  };
  listeners.add(listener);

  const messages = (type: LogType, tag?: string) =>
    records
      .filter((record) => record.type === type && (tag === undefined || record.tag === tag))
      .map((record) => record.args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));

  return {
    records,
    messages,
    has: (type, needle, tag) =>
      messages(type, tag).some((message) =>
        typeof needle === "string" ? message.includes(needle) : needle.test(message),
      ),
    clear: () => {
      records.length = 0;
    },
    restore: () => {
      listeners.delete(listener);
    },
  };
}
