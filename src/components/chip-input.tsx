"use client";

import { useState } from "react";

/**
 * Editable tag list, used for skills, roles and tech stacks.
 *
 * Enter and comma both commit — people paste comma-separated lists out of their
 * resume constantly, and rejecting that would be needless friction.
 */
export function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const additions = raw
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      // Case-insensitive dedupe, keeping whatever casing is already there.
      .filter(s => !values.some(v => v.toLowerCase() === s.toLowerCase()));

    if (additions.length) onChange([...values, ...additions]);
    setDraft("");
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {hint && <p className="mb-2 text-xs text-[var(--muted)]">{hint}</p>}

      <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--line)] p-2.5 focus-within:border-[var(--foreground)]">
        {values.map(value => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--subtle)] px-2.5 py-1 text-sm"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter(v => v !== value))}
              aria-label={`Remove ${value}`}
              className="text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              ×
            </button>
          </span>
        ))}

        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => draft && commit(draft)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-sm outline-none"
        />
      </div>
    </div>
  );
}
