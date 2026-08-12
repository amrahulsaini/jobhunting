/**
 * Full picture of what is persisted. Run: node scripts/db-audit.mjs
 */
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const DB = process.env.MONGODB_DB ?? "jobhunting";

const client = await new MongoClient(URI, { serverSelectionTimeoutMS: 5000 }).connect();
const db = client.db(DB);

const tick = v => (v ? "stored" : "—");

console.log(`${URI}/${DB}\n`);

for (const { name } of await db.listCollections().toArray()) {
  const col = db.collection(name);
  console.log(`${name}: ${await col.countDocuments()} document(s)`);
  console.log(
    `  indexes: ${(await col.indexes()).map(i => `${JSON.stringify(i.key)}${i.unique ? " UNIQUE" : ""}`).join(", ")}`
  );
}

console.log("\n--- per user ---");
for (const u of await db.collection("users").find({}).toArray()) {
  const p = u.profile ?? {};
  const s = u.hunterSummary;
  const events = await db.collection("usageEvents").countDocuments({ userId: u._id });
  const ledger = await db
    .collection("usageEvents")
    .aggregate([{ $match: { userId: u._id } }, { $group: { _id: null, t: { $sum: "$chargedUsd" } } }])
    .toArray();
  const ledgerTotal = ledger[0]?.t ?? 0;

  console.log(`\n@${u.username}  <${u.email}>`);
  console.log("  ACCOUNT");
  console.log(`    passwordHash      ${u.passwordHash ? "stored (scrypt salt:hash)" : "—"}`);
  console.log(`    plaintext password ${"password" in u ? "!! LEAKED" : "never stored"}`);
  console.log(`    createdAt/lastLogin ${tick(u.createdAt)} / ${tick(u.lastLoginAt)}`);

  console.log("  RESUME");
  console.log(`    file              ${u.resume ? `${u.resume.filename} (${(u.resume.size / 1024).toFixed(0)} KB, ${u.resume.mimeType})` : "—"}`);
  console.log(`    binary bytes      ${u.resume?.data ? u.resume.data.length() + " B" : "—"}`);
  console.log(`    extracted text    ${u.resumeText ? u.resumeText.length + " chars" : "—"}`);

  console.log("  PROFILE");
  for (const [k, v] of [
    ["fullName", p.fullName], ["headline", p.headline], ["email", p.email],
    ["phone", p.phone], ["country", p.country && `${p.country} (${p.countryCode}, via ${p.countrySource})`],
    ["seniority", p.seniority], ["yearsExperience", p.yearsExperience],
  ]) console.log(`    ${k.padEnd(17)} ${v ?? "—"}`);
  for (const [k, v] of [
    ["targetRoles", p.targetRoles], ["skills", p.skills], ["domains", p.domains],
    ["highlights", p.highlights], ["projects", p.projects],
  ]) console.log(`    ${k.padEnd(17)} ${v?.length ?? 0} item(s)`);
  console.log(`    social            ${Object.entries(p.social ?? {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "—"}`);

  console.log("  HUNTER");
  if (s) {
    console.log(`    headline          ${(s.headline ?? "").slice(0, 60)}`);
    console.log(`    summary           ${s.summary?.length ?? 0} chars`);
    console.log(`    technicalDepth    ${s.technicalDepth?.length ?? 0} chars`);
    for (const k of ["projectAnalysis", "strengths", "differentiators", "gaps", "suggestedRoles", "targetCompanies", "searchKeywords", "sourcesReviewed"])
      console.log(`    ${k.padEnd(17)} ${s[k]?.length ?? 0} item(s)`);
    console.log(`    generatedAt       ${s.generatedAt?.toISOString?.() ?? "—"}`);
  } else console.log("    (no briefing)");
  console.log(`    job state         ${u.hunterJob ? `${u.hunterJob.status} @ ${u.hunterJob.progress}%` : "—"}`);

  console.log("  BILLING");
  console.log(`    usage rows        ${events}`);
  console.log(`    ledger total      $${ledgerTotal.toFixed(6)}`);
  console.log(`    user running tot  $${(u.hunterUsageUsd ?? 0).toFixed(6)}`);
  console.log(`    reconciles        ${Math.abs(ledgerTotal - (u.hunterUsageUsd ?? 0)) < 1e-9 ? "YES" : "NO — MISMATCH"}`);

  const hunts = await db.collection("hunts").countDocuments({ userId: u._id });
  console.log(`  HUNTS             ${hunts} saved`);
}

await client.close();
