"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { ConfirmButton } from "@/components/confirm-button";

export function ResumeCard({
  filename,
  size,
  uploadedAt,
}: {
  filename?: string;
  size?: number;
  uploadedAt?: string;
}) {
  const router = useRouter();

  async function remove() {
    await fetch("/api/resume", { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wide">
          <Icon name="resume-scan" className="h-4 w-4" />
          Resume
        </h2>
        {filename && <ConfirmButton label="Delete resume" onConfirm={remove} />}
      </div>

      {filename ? (
        <div className="mt-4">
          <p className="truncate font-medium">{filename}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {size != null && `${(size / 1024).toFixed(0)} KB`}
            {uploadedAt && ` · uploaded ${new Date(uploadedAt).toLocaleDateString()}`}
          </p>
          <a
            href="/api/resume/file"
            className="mt-4 inline-flex rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
          >
            Download
          </a>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">No resume yet — add one below.</p>
      )}
    </section>
  );
}
