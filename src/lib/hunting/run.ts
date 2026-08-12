import { ObjectId } from "mongodb";
import { hunts, users } from "@/lib/db/collections";
import { recordUsage } from "@/lib/billing/usage";
import { discoverCompanies } from "./discover";
import { enrichAll, type EnrichResult } from "./enrich";
import type { HuntConfig } from "./types";
import type { HunterSummary, UserProfile } from "@/lib/db/collections";

/**
 * Runs a hunt end to end and writes progress into the user document as it goes,
 * exactly like the briefing job — so the run survives a closed tab.
 */
export async function runHunt({
  userId,
  profile,
  briefing,
  config,
}: {
  userId: ObjectId;
  profile: UserProfile;
  briefing?: HunterSummary;
  config: HuntConfig;
}): Promise<void> {
  const col = await users();

  const report = (stage: string, progress: number, found: number) => {
    void col.updateOne(
      { _id: userId },
      {
        $set: {
          "huntJob.stage": stage,
          "huntJob.progress": progress,
          "huntJob.found": found,
        },
      }
    );
  };

  try {
    const roles = config.roles?.length
      ? config.roles
      : [briefing?.suggestedRoles?.[0] ?? profile.targetRoles?.[0] ?? "software engineer"];

    report("Searching Google for companies hiring", 8, 0);

    const discovery = await discoverCompanies({
      profile,
      briefing,
      config,
      roles,
      // Discovery occupies the first third; searches are the slow part.
      onProgress: (role, index, total) =>
        report(
          `Searching for ${role} (${index + 1} of ${total})`,
          8 + Math.round((index / total) * 25),
          0
        ),
    });
    for (const usage of discovery.usages) await recordUsage(userId, "other", usage);

    // Ask for extra, then research only as many as the user paid attention for.
    const shortlist = discovery.companies.slice(0, config.matches);

    const outside = discovery.rejected.length
      ? `, ${discovery.rejected.length} outside your countries`
      : "";
    report(
      `${discovery.companies.length} companies in scope${outside} — verifying contacts`,
      35,
      shortlist.length
    );

    const enriched: EnrichResult[] = await enrichAll(shortlist, (done, total, name) => {
      report(
        `Checking ${name} (${done + 1} of ${total})`,
        35 + Math.round(((done + 1) / Math.max(total, 1)) * 55),
        total
      );
    });

    const finishedAt = new Date();
    const inserted = await hunts().then(c =>
      c.insertOne({
        userId,
        role: roles.join(" · "),
        roles,
        config,
        searchQueries: discovery.searchQueries,
        rejected: discovery.rejected,
        sources: discovery.sources,
        companies: enriched,
        totalDiscovered: discovery.companies.length,
        createdAt: finishedAt,
      })
    );

    await col.updateOne(
      { _id: userId },
      {
        $set: {
          huntJob: {
            status: "done",
            stage: "Hunt complete",
            progress: 100,
            found: enriched.length,
            huntId: String(inserted.insertedId),
            startedAt: finishedAt,
            finishedAt,
          },
        },
      }
    );
  } catch (error) {
    await col.updateOne(
      { _id: userId },
      {
        $set: {
          "huntJob.status": "failed",
          "huntJob.stage": "Failed",
          "huntJob.finishedAt": new Date(),
          "huntJob.error": error instanceof Error ? error.message : "The hunt could not run.",
        },
      }
    );
  }
}
