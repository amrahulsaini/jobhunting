import { MongoClient, type Db } from "mongodb";

/**
 * MongoDB connection.
 *
 * Two things worth knowing about the URI:
 *
 * 1. It uses 127.0.0.1, not `localhost`. On Windows, `localhost` resolves to the
 *    IPv6 address ::1 first, but MongoDB binds to IPv4 by default — so
 *    `mongodb://localhost` spends ~30s failing over before it connects, or times
 *    out entirely. Pinning IPv4 avoids that.
 *
 * 2. The client is cached on `globalThis` in development. Next.js hot-reloads
 *    modules on every file save; without the cache each reload would open a new
 *    pool and you would exhaust connections within a few minutes of editing.
 */

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB ?? "jobhunting";

declare global {
  var __mongoClient: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  return new MongoClient(URI, {
    // Fail fast with a clear error instead of hanging when mongod is not running.
    serverSelectionTimeoutMS: 5000,
  }).connect();
}

const clientPromise: Promise<MongoClient> =
  process.env.NODE_ENV === "development"
    ? (globalThis.__mongoClient ??= connect())
    : connect();

export async function getDb(): Promise<Db> {
  try {
    const client = await clientPromise;
    return client.db(DB_NAME);
  } catch (error) {
    // In dev, clear the cached rejection so the next request retries rather than
    // replaying the same failed promise forever.
    if (process.env.NODE_ENV === "development") globalThis.__mongoClient = undefined;
    throw new Error(
      `Cannot reach MongoDB at ${URI}. Is the service running? ` +
        `(${error instanceof Error ? error.message : String(error)})`
    );
  }
}

export { DB_NAME, URI };
