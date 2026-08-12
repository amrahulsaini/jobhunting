"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { ChipInput } from "@/components/chip-input";
import { ConfirmButton } from "@/components/confirm-button";

const FIELD =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--foreground)]";

interface Project {
  name: string;
  description?: string;
  url?: string;
  tech?: string[];
}

export interface ProfileDraft {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  countryCode: string;
  seniority: string;
  yearsExperience: string;
  targetRoles: string[];
  skills: string[];
  domains: string[];
  highlights: string[];
  projects: Project[];
  social: { linkedin: string; github: string; portfolio: string; twitter: string };
}

const EMPTY: ProfileDraft = {
  fullName: "", headline: "", email: "", phone: "", countryCode: "",
  seniority: "", yearsExperience: "", targetRoles: [], skills: [], domains: [],
  highlights: [], projects: [],
  social: { linkedin: "", github: "", portfolio: "", twitter: "" },
};

const STEPS = ["Resume", "Details", "Location", "Links", "Skills & projects"];

export function ResumeWizard({
  initial,
  countries,
  detectedCountry,
  hasProfile,
  onStarted,
}: {
  initial?: Partial<ProfileDraft>;
  countries: { code: string; name: string }[];
  detectedCountry?: string;
  hasProfile: boolean;
  /** Called once the briefing job is accepted, so the parent shows progress. */
  onStarted?: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(hasProfile ? 1 : 0);
  const [draft, setDraft] = useState<ProfileDraft>({ ...EMPTY, ...initial });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countrySource, setCountrySource] = useState<string | undefined>(
    initial?.countryCode ? "resume" : detectedCountry ? "ip" : undefined
  );

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  // ------------------------------------------------------------------ upload
  async function upload() {
    if (!file) return setError("Choose a PDF or DOCX first.");
    setError(null);
    setBusy("Reading your resume…");

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resume", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) return setError(json.error ?? "Could not read that resume.");

      const p = json.parsed;
      setDraft({
        fullName: p.fullName ?? "",
        headline: p.headline ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        countryCode: p.countryCode ?? detectedCountry ?? "",
        seniority: p.seniority ?? "",
        yearsExperience: p.yearsExperience != null ? String(p.yearsExperience) : "",
        targetRoles: p.targetRoles ?? [],
        skills: p.skills ?? [],
        domains: p.domains ?? [],
        highlights: p.highlights ?? [],
        projects: p.projects ?? [],
        social: {
          linkedin: p.social?.linkedin ?? "",
          github: p.social?.github ?? "",
          portfolio: p.social?.portfolio ?? "",
          twitter: p.social?.twitter ?? "",
        },
      });
      setCountrySource(p.countrySource);
      setStep(1);
    } catch {
      setError("Upload failed. Is the server still running?");
    } finally {
      setBusy(null);
    }
  }

  // -------------------------------------------------------------------- save
  async function save(): Promise<boolean> {
    setError(null);
    setBusy("Saving…");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          yearsExperience: draft.yearsExperience ? Number(draft.yearsExperience) : undefined,
          country: countries.find(c => c.code === draft.countryCode)?.name,
          countrySource,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Could not save.");
        return false;
      }
      return true;
    } catch {
      setError("Could not save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  // ------------------------------------------------------------------ hunter
  async function sendToHunter() {
    if (!(await save())) return;
    setError(null);
    setBusy("Starting Hunter…");

    try {
      // Returns as soon as the job is claimed; the work continues server-side.
      const res = await fetch("/api/hunter", { method: "POST" });
      const json = await res.json();
      if (!json.ok) return setError(json.error ?? "Hunter could not run.");

      onStarted?.();
      router.refresh();
    } catch {
      setError("Hunter could not run.");
    } finally {
      setBusy(null);
    }
  }

  async function next() {
    if (await save()) setStep(s => Math.min(s + 1, STEPS.length - 1));
  }

  return (
    <div>
      {/* Progress */}
      <ol className="mb-8 flex flex-wrap gap-x-2 gap-y-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${
                i === step
                  ? "is-selected"
                  : i < step
                    ? "border-[var(--line-strong)] hover:bg-[var(--subtle)]"
                    : "border-[var(--line)] text-[var(--muted)]"
              }`}
            >
              <span className="font-mono">{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-[var(--foreground)] px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {/* ------------------------------------------------------- 0: resume */}
      {step === 0 && (
        <section className="card p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">Upload your resume</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            PDF or DOCX. We read the file directly, so two-column layouts survive intact.
          </p>

          <label
            htmlFor="resume"
            className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center transition-colors hover:bg-[var(--subtle)]"
          >
            <Icon name="resume-upload" className="h-8 w-8" />
            <span className="mt-3 text-sm font-medium">{file ? file.name : "Choose a file"}</span>
            <span className="mt-1 text-xs text-[var(--muted)]">PDF, DOCX or TXT · up to 8MB</span>
            <input
              id="resume"
              type="file"
              accept=".pdf,.docx,.doc,.txt,application/pdf"
              className="sr-only"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null); }}
            />
          </label>

          <button
            type="button"
            onClick={upload}
            disabled={!file || busy !== null}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl btn-accent px-6 py-3.5 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
          >
            {busy ?? "Parse my resume"}
          </button>
        </section>
      )}

      {/* ------------------------------------------------------ 1: details */}
      {step === 1 && (
        <section className="card p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">Check what we read</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Everything here came out of your resume. Correct anything that&apos;s wrong — these
            are the facts Hunter will use.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium">Full name</label>
              <input id="fullName" value={draft.fullName} onChange={e => set("fullName", e.target.value)} className={FIELD} />
            </div>
            <div>
              <label htmlFor="headline" className="mb-1.5 block text-sm font-medium">Headline</label>
              <input id="headline" value={draft.headline} onChange={e => set("headline", e.target.value)} className={FIELD} />
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
              <input id="email" type="email" value={draft.email} onChange={e => set("email", e.target.value)} className={FIELD} placeholder="Not found in resume" />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">Contact number</label>
              <input id="phone" value={draft.phone} onChange={e => set("phone", e.target.value)} className={FIELD} placeholder="Not found in resume" />
            </div>
            <div>
              <label htmlFor="seniority" className="mb-1.5 block text-sm font-medium">Seniority</label>
              <select id="seniority" value={draft.seniority} onChange={e => set("seniority", e.target.value)} className={FIELD}>
                <option value="">—</option>
                {["intern","junior","mid","senior","staff","principal","lead"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="years" className="mb-1.5 block text-sm font-medium">Years of experience</label>
              <input id="years" type="number" min="0" max="60" value={draft.yearsExperience} onChange={e => set("yearsExperience", e.target.value)} className={FIELD} />
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <ChipInput label="Target roles" values={draft.targetRoles} onChange={v => set("targetRoles", v)} placeholder="Senior Full Stack Engineer" />
            <ChipInput label="Domains" values={draft.domains} onChange={v => set("domains", v)} placeholder="Fintech, developer tools" />
            <ChipInput
              label="Key accomplishments"
              hint="Hunter quotes these in your emails, so keep the real numbers in."
              values={draft.highlights}
              onChange={v => set("highlights", v)}
              placeholder="Cut p95 latency from 850ms to 120ms"
            />
          </div>

          <StepNav onNext={next} busy={busy} />
        </section>
      )}

      {/* ----------------------------------------------------- 2: location */}
      {step === 2 && (
        <section className="card p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">Where are you hunting?</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {countrySource === "ip"
              ? "We guessed this from your connection — change it if it's wrong."
              : countrySource === "resume"
                ? "We took this from your resume — change it if it's wrong."
                : "Pick the country you want to work in."}
          </p>

          <div className="mt-5 max-w-sm">
            <label htmlFor="country" className="mb-1.5 block text-sm font-medium">Country</label>
            <select
              id="country"
              value={draft.countryCode}
              onChange={e => { set("countryCode", e.target.value); setCountrySource("manual"); }}
              className={FIELD}
            >
              <option value="">Select a country</option>
              {countries.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <p className="mt-2 text-xs text-[var(--muted)]">
              This also sets the currency your Hunter usage is shown in.
            </p>
          </div>

          <StepNav onBack={() => setStep(1)} onNext={next} busy={busy} />
        </section>
      )}

      {/* -------------------------------------------------------- 3: links */}
      {step === 3 && (
        <section className="card p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">Your links</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Anything we found in your resume is filled in. Hunter reads these pages directly, so
            the more you add, the sharper its briefing.
          </p>

          <div className="mt-6 space-y-4">
            {([
              ["github", "GitHub", "https://github.com/yourhandle"],
              ["linkedin", "LinkedIn", "https://linkedin.com/in/yourhandle"],
              ["portfolio", "Portfolio website", "https://yoursite.dev"],
              ["twitter", "X / Twitter", "https://x.com/yourhandle"],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key}>
                <label htmlFor={key} className="mb-1.5 block text-sm font-medium">{label}</label>
                <input
                  id={key}
                  value={draft.social[key]}
                  onChange={e => set("social", { ...draft.social, [key]: e.target.value })}
                  className={FIELD}
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>

          <StepNav onBack={() => setStep(2)} onNext={next} busy={busy} />
        </section>
      )}

      {/* ---------------------------------------------- 4: skills/projects */}
      {step === 4 && (
        <section className="card p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">Skills and projects</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Add anything your resume left out — side projects and recent tools especially.
          </p>

          <div className="mt-6">
            <ChipInput
              label="Technical skills"
              hint="Languages, frameworks, databases, platforms."
              values={draft.skills}
              onChange={v => set("skills", v)}
              placeholder="TypeScript, Postgres, AWS"
            />
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Projects</h3>
              <button
                type="button"
                onClick={() => set("projects", [...draft.projects, { name: "", description: "", url: "", tech: [] }])}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--subtle)]"
              >
                + Add project
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {draft.projects.length === 0 && (
                <p className="text-sm text-[var(--muted)]">No projects yet.</p>
              )}

              {draft.projects.map((project, i) => (
                <div key={i} className="relative rounded-xl border border-[var(--line)] p-4">
                  <div className="absolute right-3 top-3">
                    <ConfirmButton
                      label={`Delete ${project.name || "project"}`}
                      onConfirm={() => set("projects", draft.projects.filter((_, j) => j !== i))}
                    />
                  </div>

                  <div className="grid gap-3 pr-12 sm:grid-cols-2">
                    <input
                      value={project.name}
                      onChange={e => {
                        const next = [...draft.projects];
                        next[i] = { ...project, name: e.target.value };
                        set("projects", next);
                      }}
                      className={FIELD}
                      placeholder="Project name"
                    />
                    <input
                      value={project.url ?? ""}
                      onChange={e => {
                        const next = [...draft.projects];
                        next[i] = { ...project, url: e.target.value };
                        set("projects", next);
                      }}
                      className={FIELD}
                      placeholder="https://github.com/you/project"
                    />
                  </div>

                  <textarea
                    value={project.description ?? ""}
                    onChange={e => {
                      const next = [...draft.projects];
                      next[i] = { ...project, description: e.target.value };
                      set("projects", next);
                    }}
                    rows={2}
                    className={`${FIELD} mt-3`}
                    placeholder="What it does, and what you built."
                  />

                  <div className="mt-3">
                    <ChipInput
                      label="Tech used"
                      values={project.tech ?? []}
                      onChange={v => {
                        const next = [...draft.projects];
                        next[i] = { ...project, tech: v };
                        set("projects", next);
                      }}
                      placeholder="Next.js, Postgres"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-[var(--line-strong)] bg-[var(--subtle)] p-5">
            <div className="flex items-start gap-3">
              <Icon name="hunter" className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h3 className="font-semibold tracking-tight">Ready for Hunter</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Hunter will read every link you gave it and write a detailed briefing on you.
                  This uses AI credits, billed to your Hunter Usage.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={sendToHunter}
              disabled={busy !== null}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl btn-accent px-6 py-3.5 text-sm font-medium shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] disabled:translate-y-0 disabled:opacity-60"
            >
              <Icon name="hunter" className="h-4 w-4" />
              {busy ?? "Submit all details to Hunter"}
            </button>
          </div>

          <StepNav onBack={() => setStep(3)} busy={busy} />
        </section>
      )}

    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  busy,
}: {
  onBack?: () => void;
  onNext?: () => void;
  busy: string | null;
}) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-[var(--line)] px-5 py-3 text-sm font-medium transition-colors hover:bg-[var(--subtle)]"
        >
          Back
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl btn-accent px-6 py-3 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {busy ?? "Save and continue"}
        </button>
      )}
    </div>
  );
}
