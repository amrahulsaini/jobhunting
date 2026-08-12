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
    for (const usage of discovery.usages) await recordUsage(userId, "job-hunting", usage);


    const outside = discovery.rejected.length
      ? `, ${discovery.rejected.length} outside your countries`
      : "";
    report(
      `${discovery.companies.length} companies in scope${outside} — verifying contacts`,
      35,
      0
    );

    /**
     * Keep researching until the user actually has the number of usable results
     * they asked for.
     *
     * Previously we researched exactly `matches` companies and returned
     * whatever came back — which meant five dead domains counted as five
     * results. Discovery finds far more candidates than requested, so a dead or
     * parked domain is now replaced by the next candidate rather than wasting
     * a slot.
     */
    const wanted = config.matches;
    const enriched: EnrichResult[] = [];
    const discarded: EnrichResult[] = [];
    let cursor = 0;

    // Bounded so a run of bad candidates cannot loop forever.
    const budget = Math.min(discovery.companies.length, wanted * 4);

    while (enriched.length < wanted && cursor < budget) {
      const batch = discovery.companies.slice(cursor, cursor + Math.max(2, wanted - enriched.length));
      cursor += batch.length;
      if (!batch.length) break;

      const results = await enrichAll(batch, (done, total, name) => {
        const progress = 35 + Math.round((enriched.length / wanted) * 55);
        report(`Checking ${name} — ${enriched.length} of ${wanted} usable so far`, progress, enriched.length);
      });

      for (const result of results) {
        // A dead domain or one with no way to apply is not a result.
        if (result.reachable && result.actionable) enriched.push(result);
        else discarded.push(result);
      }
    }

    // Only if we ran out of candidates do the unusable ones get shown, so the
    // report is never silently short without saying why.
    const finalCompanies = enriched.slice(0, wanted);

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
        companies: finalCompanies,
        /** Dead or unusable candidates, kept so the count is explainable. */
        discarded,
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
            found: finalCompanies.length,
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
