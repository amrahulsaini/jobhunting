import { ObjectId } from "mongodb";
import { ensureIndexes, usageEvents, users, type UsageEventDoc } from "@/lib/db/collections";
import { chargedCostUsd, rawCostUsd, MARKUP } from "./pricing";
import type { TokenUsage } from "@/lib/gemini";

/**
 * Records one model call against a user and adds the charge to their balance.
 *
 * The ledger insert and the running-total increment happen together so the
 * summary figure on the profile can always be reconciled against the rows that
 * produced it.
 */
export async function recordUsage(
  userId: ObjectId | string,
  purpose: UsageEventDoc["purpose"],
  usage: TokenUsage
): Promise<{ rawUsd: number; chargedUsd: number }> {
  const id = typeof userId === "string" ? new ObjectId(userId) : userId;
  // Cached after the first call; guarantees the index exists even for accounts
  // created before it was added.
  await ensureIndexes();

  const raw = rawCostUsd(usage.model, usage.inputTokens, usage.outputTokens);
  const charged = chargedCostUsd(usage.model, usage.inputTokens, usage.outputTokens);

  const events = await usageEvents();
  await events.insertOne({
    userId: id,
    purpose,
    model: usage.model,
    provider: usage.provider,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    rawCostUsd: raw,
    chargedUsd: charged,
    markup: MARKUP,
    createdAt: new Date(),
  });

  const col = await users();
  await col.updateOne({ _id: id }, { $inc: { hunterUsageUsd: charged } });

  return { rawUsd: raw, chargedUsd: charged };
}

/** Records several calls at once, e.g. a batch of drafts. */
export async function recordUsageBatch(
  userId: ObjectId | string,
  purpose: UsageEventDoc["purpose"],
  usages: TokenUsage[]
): Promise<{ rawUsd: number; chargedUsd: number }> {
  let rawUsd = 0;
  let chargedUsd = 0;
  for (const usage of usages) {
    const result = await recordUsage(userId, purpose, usage);
    rawUsd += result.rawUsd;
    chargedUsd += result.chargedUsd;
  }
  return { rawUsd, chargedUsd };
}

export interface UsageSummary {
  totalUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  byPurpose: { purpose: string; calls: number; chargedUsd: number }[];
}

export async function usageSummary(userId: ObjectId | string): Promise<UsageSummary> {
  const id = typeof userId === "string" ? new ObjectId(userId) : userId;
  const events = await usageEvents();

  const rows = await events
    .aggregate<{
      _id: string;
      calls: number;
      chargedUsd: number;
      inputTokens: number;
      outputTokens: number;
    }>([
      { $match: { userId: id } },
      {
        $group: {
          _id: "$purpose",
          calls: { $sum: 1 },
          chargedUsd: { $sum: "$chargedUsd" },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
        },
      },
      { $sort: { chargedUsd: -1 } },
    ])
    .toArray();

  return {
    totalUsd: rows.reduce((sum, r) => sum + r.chargedUsd, 0),
    calls: rows.reduce((sum, r) => sum + r.calls, 0),
    inputTokens: rows.reduce((sum, r) => sum + r.inputTokens, 0),
    outputTokens: rows.reduce((sum, r) => sum + r.outputTokens, 0),
    byPurpose: rows.map(r => ({ purpose: r._id, calls: r.calls, chargedUsd: r.chargedUsd })),
  };
}
