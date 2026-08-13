"use client";

import { useState } from "react";

const TABS = ["Generate", "Drafts", "Settings", "Inbox"] as const;
type Tab = (typeof TABS)[number];

export function OutreachTabs({
  draftCount,
  generate,
  drafts,
  settings,
  inbox,
}: {
  draftCount: number;
  generate: React.ReactNode;
  drafts: React.ReactNode;
  settings: React.ReactNode;
  inbox: React.ReactNode;
}) {
  // Drafts first when there is something waiting, otherwise start on Generate.
  const [tab, setTab] = useState<Tab>(draftCount > 0 ? "Drafts" : "Generate");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] pb-4">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              tab === t ? "is-selected" : "border-[var(--line)] hover:bg-[var(--subtle)]"
            }`}
          >
            {t}
            {t === "Drafts" && draftCount > 0 && (
              <span className="ml-2 text-xs opacity-70">{draftCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* The inbox needs a bounded height to scroll internally, so only it gets
          the flex treatment — the other tabs scroll with the page. */}
      <div className={`mt-5 ${tab === "Inbox" ? "flex min-h-0 flex-1 flex-col" : ""}`}>
        {tab === "Generate" && generate}
        {tab === "Drafts" && drafts}
        {tab === "Settings" && settings}
        {tab === "Inbox" && inbox}
      </div>
    </div>
  );
}
