/**
 * Prints every stored field, fully expanded.
 *
 * Compass collapses nested sub-documents and hides large Binary fields, which
 * makes it look like data is missing when it is not. This dumps everything
 * except the raw resume bytes, which are summarised instead of printed.
 *
 * Run: node scripts/db-dump.mjs [username]
 */
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const DB = process.env.MONGODB_DB ?? "jobhunting";
const only = process.argv[2];

const client = await new MongoClient(URI, { serverSelectionTimeoutMS: 5000 }).connect();
const db = client.db(DB);

const query = only ? { username: only } : {};
for (const user of await db.collection("users").find(query).toArray()) {
  // Replace the binary with a description so the rest stays readable.
  const readable = {
    ...user,
    passwordHash: `${String(user.passwordHash).slice(0, 24)}… (scrypt)`,
    resume: user.resume
      ? { ...user.resume, data: `<Binary ${user.resume.data.length()} bytes>` }
      : undefined,
    resumeText: user.resumeText
      ? `${user.resumeText.slice(0, 300)}… (${user.resumeText.length} chars total)`
      : undefined,
  };

  console.log("=".repeat(70));
  console.log(`@${user.username}`);
  console.log("=".repeat(70));
  console.log(JSON.stringify(readable, null, 2));

  const events = await db
    .collection("usageEvents")
    .find({ userId: user._id })
    .sort({ createdAt: -1 })
    .toArray();

  console.log(`\n--- usageEvents (${events.length}) ---`);
  for (const e of events) {
    console.log(
      `  ${new Date(e.createdAt).toISOString().slice(0, 19)}  ${String(e.purpose).padEnd(15)}` +
        `${String(e.model).padEnd(23)} in ${String(e.inputTokens).padStart(6)} out ${String(e.outputTokens).padStart(5)}` +
        `  charged $${e.chargedUsd.toFixed(6)}`
    );
  }
  console.log();
}

await client.close();
