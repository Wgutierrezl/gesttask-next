export const REDACTED = "[REDACTED]";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext): void;
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Keys whose values are credentials or derived from them (REQ-SEC-01): masked wherever they appear. */
const SENSITIVE_KEY = /pass(word|wd)|secret|token|cookie|authorization|api[-_]?key|signature|hash|credential|session/i;
/** A query string that carries a signature or token: the whole URL is a bearer credential. */
const SIGNED_URL = /[?&](x-amz-signature|x-amz-credential|x-amz-security-token|signature|sig|token)=/i;
const BEARER = /Bearer\s+[\w\-.~+/=]+/g;

const redactString = (value: string): string =>
  SIGNED_URL.test(value) ? REDACTED : value.replace(BEARER, `Bearer ${REDACTED}`);

/** Deep copy with sensitive keys masked and secrets inside strings scrubbed. Errors lose their stack. */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : redact(item, seen)]),
  );
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Receives one JSON document per entry; defaults to stdout. */
  write?: (line: string) => void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = RANK[options.level ?? "info"];
  const write = options.write ?? ((line: string) => void process.stdout.write(`${line}\n`));
  const log = (level: LogLevel) => (msg: string, context: LogContext = {}) => {
    if (RANK[level] < threshold) return;
    write(JSON.stringify({ ...(redact(context) as LogContext), level, msg, time: new Date().toISOString() }));
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}
