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

export interface DbConfig {
  driver: "pg" | "neon";
  url: string;
  /** Server-side `statement_timeout`; also bounds lock waits. Unset means no limit. */
  statementTimeoutMs?: number;
  maxConnections?: number;
}

export interface DbHandle {
  db: Database;
  close(): Promise<void>;
}

/**
 * `pg` (node-postgres) for local and CI, `neon` (WebSocket pool) for production: both support
 * interactive transactions, unlike the Neon HTTP driver. Pools connect lazily.
 */
export function createDb(config: DbConfig): DbHandle {
  if (config.driver === "neon") {
    const pool = new NeonPool({ connectionString: config.url, max: config.maxConnections });
    return { db: drizzleNeon({ client: pool, schema }) as unknown as Database, close: () => pool.end() };
  }
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.maxConnections,
    statement_timeout: config.statementTimeoutMs,
  });
  return { db: drizzlePg({ client: pool, schema }), close: () => pool.end() };
}
