"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export interface Settings {
  tone: string;
  length: string;
  callToAction: string;
  includeProjects: boolean;
  includePortfolio: boolean;
  includeGithub: boolean;
  attachResume: boolean;
  customInstructions?: string;
  signature?: string;
}

const FIELD =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--foreground)]";

const TONES = [
  { id: "cold-intro", label: "Cold intro", hint: "Warm, confident, never apologetic" },
  { id: "warm-direct", label: "Direct", hint: "Peer to peer, no preamble" },
  { id: "formal", label: "Formal", hint: "For larger or traditional employers" },
  { id: "concise", label: "Concise", hint: "Every sentence earns its place" },
];

const LENGTHS = [
  { id: "short", label: "Short", hint: "3 paragraphs" },
  { id: "standard", label: "Standard", hint: "4 paragraphs" },
  { id: "detailed", label: "Detailed", hint: "5 paragraphs" },
];

const CTAS = [
  { id: "chat", label: "Ask for a call" },
  { id: "meet", label: "Ask to meet" },
  { id: "either", label: "Chat or meet" },
  { id: "none", label: "Just a reply" },
];

function Choice({
  options,
  value,
  onPick,
}: {
  options: { id: string; label: string; hint?: string }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onPick(o.id)}
          aria-pressed={value === o.id}
          title={o.hint}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            value === o.id ? "is-selected" : "border-[var(--line)] hover:bg-[var(--subtle)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmailSettingsPanel({
  initial,
  hasResume,
}: {
  initial: Settings;
  hasResume: boolean;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/outreach/send", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card p-6 sm:p-7">
      <h2 className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wide">
        <Icon name="draft-ai" className="h-4 w-4" />
        Email settings
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        How Hunter writes every email. Applies to all future drafts.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Tone</label>
          <Choice options={TONES} value={settings.tone} onPick={v => set("tone", v)} />

          <label className="mt-6 block text-sm font-medium">Length</label>
          <Choice options={LENGTHS} value={settings.length} onPick={v => set("length", v)} />

          <label className="mt-6 block text-sm font-medium">How to close</label>
          <Choice options={CTAS} value={settings.callToAction} onPick={v => set("callToAction", v)} />
        </div>

        <div>
          <label className="text-sm font-medium">What to include</label>
          <div className="mt-2 space-y-2">
            {[
              { key: "includeProjects" as const, label: "Project links and descriptions" },
              { key: "includePortfolio" as const, label: "Portfolio link" },
              { key: "includeGithub" as const, label: "GitHub link" },
              {
                key: "attachResume" as const,
                label: hasResume ? "Attach my resume" : "Attach my resume (none uploaded)",
                disabled: !hasResume,
              },
            ].map(item => (
              <label
                key={item.key}
                className={`flex items-center gap-3 rounded-xl border border-[var(--line)] px-4 py-3 text-sm transition-colors ${
                  item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[var(--subtle)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings[item.key]) && !item.disabled}
                  disabled={item.disabled}
                  onChange={e => set(item.key, e.target.checked)}
                  className="accent-[var(--foreground)]"
                />
                {item.label}
              </label>
            ))}
          </div>

          <label htmlFor="signature" className="mt-6 block text-sm font-medium">
            Signature
          </label>
          <textarea
            id="signature"
            rows={3}
            value={settings.signature ?? ""}
            onChange={e => set("signature", e.target.value)}
            placeholder={"Aman Saini\n+91 …\namansaini.dev"}
            className={`${FIELD} mt-2`}
          />
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            Appended exactly as written — Hunter never rewords it.
          </p>
        </div>
      </div>

      {/* The user's own words, applied on top of everything above. */}
      <div className="mt-6 border-t border-[var(--line)] pt-6">
        <label htmlFor="custom" className="block text-sm font-medium">
          Write it yourself
        </label>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Anything here overrides the settings above. Tell Hunter what to say, what to avoid, or
          paste a template to follow.
        </p>
        <textarea
          id="custom"
          rows={5}
          value={settings.customInstructions ?? ""}
          onChange={e => set("customInstructions", e.target.value)}
          placeholder="e.g. Mention I can start immediately. Never mention salary. Keep the opening to one sentence. Always reference their engineering blog if the brief has one."
          className={`${FIELD} mt-3`}
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-accent rounded-xl px-6 py-3 text-sm font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-sm text-[var(--muted)]">Saved.</span>}
      </div>
    </section>
  );
}
