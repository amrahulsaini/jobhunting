/**
 * Inspects the local database. Run: node scripts/db-check.mjs
 * Useful when Compass isn't open, and as a check that writes are landing.
 */
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const DB = process.env.MONGODB_DB ?? "jobhunting";

const client = await new MongoClient(URI, { serverSelectionTimeoutMS: 5000 }).connect();
const db = client.db(DB);

console.log(`connected: ${URI}/${DB}\n`);

for (const { name } of await db.listCollections().toArray()) {
  const col = db.collection(name);
  const count = await col.countDocuments();
  console.log(`${name}: ${count} document(s)`);

  const indexes = await col.indexes();
  console.log(`  indexes: ${indexes.map(i => `${JSON.stringify(i.key)}${i.unique ? " UNIQUE" : ""}`).join(", ")}`);

  const doc = await col.findOne({}, { sort: { createdAt: -1 } });
  if (!doc) continue;

  if (name === "users") {
    console.log(`  email: ${doc.email}`);
    console.log(`  name: ${doc.name ?? "(none)"}`);
    console.log(`  passwordHash: ${String(doc.passwordHash).slice(0, 44)}…`);
    console.log(`  plaintext password stored anywhere? ${"password" in doc ? "YES — BUG" : "no"}`);
  } else if (name === "hunts") {
    console.log(`  role: ${doc.role} | jobs: ${doc.jobs?.length} | drafts: ${doc.drafts?.length}`);
  }
  console.log();
}

await client.close();
