import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool as NeonPool } from "@neondatabase/serverless";
import pg from "pg";
import * as schema from "./schema";

/**
 * The query surface shared by both drivers (the Neon pool returns node-postgres `QueryResult`s, so one
 * type serves both); transactions hand out the same shape.
 */
export type Database = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export const DEFAULT_STATEMENT_TIMEOUT_MS = 15_000;
export const DEFAULT_LOCK_TIMEOUT_MS = 5_000;

export interface DbConfig {
  driver: "pg" | "neon";
  url: string;
  /** Server-side `statement_timeout` in ms (0 disables). Defaults to 15 s. */
  statementTimeoutMs?: number;
  /** Server-side `lock_timeout` in ms (0 disables): a lock wait fails fast instead of piling up. Defaults to 5 s. */
  lockTimeoutMs?: number;
  maxConnections?: number;
}

export interface DbHandle {
  db: Database;
  close(): Promise<void>;
}

/** The slice of `pg.Pool` (also implemented by the Neon pool) that session setup needs. */
interface PoolEvents {
  on(event: "connect", listener: (client: { query(text: string): PromiseLike<unknown> }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

function timeoutMs(name: string, value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return resolved;
}

// eslint-disable-next-line no-console -- the pool's own error channel; the app has no logger yet
const defaultLog = (...args: unknown[]) => console.error(...args);

/** Credentials can appear in driver messages (connection strings); never log them. */
const scrub = (text: string) => text.replace(/\/\/[^@\s/]*@/g, "//***@");

/** Validated session limits shared by both drivers. */
export function resolveTimeouts(config: Pick<DbConfig, "statementTimeoutMs" | "lockTimeoutMs">) {
  return {
    statement: timeoutMs("statementTimeoutMs", config.statementTimeoutMs, DEFAULT_STATEMENT_TIMEOUT_MS),
    lock: timeoutMs("lockTimeoutMs", config.lockTimeoutMs, DEFAULT_LOCK_TIMEOUT_MS),
  };
}

/**
 * Pool setup shared by both drivers. Idle-client errors are logged (code and scrubbed message only)
 * because an unhandled pool `error` event would crash the process. With `limitsOnConnect`, every new
 * connection also gets `statement_timeout` and `lock_timeout` via a SET (used for Neon, whose pooled
 * endpoint may reject startup parameters); `pg` sends them as startup parameters instead, which avoids
 * issuing a query while the pool hands the client out.
 */
export function configurePool(
  pool: PoolEvents,
  config: Pick<DbConfig, "statementTimeoutMs" | "lockTimeoutMs">,
  log: (...args: unknown[]) => void = defaultLog,
  limitsOnConnect = true,
): void {
  const { statement, lock } = resolveTimeouts(config);
  if (limitsOnConnect) {
    const setup = `SET statement_timeout = ${statement}; SET lock_timeout = ${lock}`;
    pool.on("connect", (client) => {
      void Promise.resolve(client.query(setup)).then(undefined, (error: unknown) =>
        log("[db] failed to set session timeouts", { message: scrub(String((error as Error)?.message ?? error)) }),
      );
    });
  }
  pool.on("error", (error) =>
    log("[db] idle client error", { code: (error as { code?: unknown }).code, message: scrub(error.message) }),
  );
}

/**
 * `pg` (node-postgres) for local and CI, `neon` (WebSocket pool) for production: both support
 * interactive transactions, unlike the Neon HTTP driver. Pools connect lazily.
 */
export function createDb(config: DbConfig): DbHandle {
  if (config.driver === "neon") {
    const pool = new NeonPool({ connectionString: config.url, max: config.maxConnections });
    configurePool(pool, config);
    return { db: drizzleNeon({ client: pool, schema }) as unknown as Database, close: () => pool.end() };
  }
  const { statement, lock } = resolveTimeouts(config);
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.maxConnections,
    statement_timeout: statement,
    lock_timeout: lock,
  });
  configurePool(pool, config, defaultLog, false);
  return { db: drizzlePg({ client: pool, schema }), close: () => pool.end() };
}
