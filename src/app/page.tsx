import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";
import { Icon } from "@/components/icon";
import { assets } from "@/lib/assets";
import { currentUser } from "@/lib/auth/session";
import type { IconName } from "@/lib/assets";

const STEPS = [
  {
    n: "01",
    icon: "resume-upload" as IconName,
    title: "Drop your resume in",
    body: "PDF, DOCX or a LinkedIn export. Add a portfolio or GitHub link and we read those too.",
    art: assets.step1Upload,
  },
  {
    n: "02",
    icon: "resume-scan" as IconName,
    title: "We parse who you actually are",
    body: "Roles, seniority, stack, domains, years per skill — pulled out as structured data, not keywords. Every accomplishment keeps the real figure attached.",
    art: assets.step2Parse,
  },
  {
    n: "03",
    icon: "globe-crawl" as IconName,
    title: "It finds your matches",
    body: "Startup platforms and thousands of company career pages, searched at once — then filtered down to the roles that fit the experience you actually have. No duplicates, no noise.",
    art: assets.step3Crawl,
  },
  {
    n: "04",
    icon: "mail-search" as IconName,
    title: "Real contacts, not a form",
    body: "For each company we find the live careers page and the hiring address published behind it — so your message lands with a person instead of disappearing into a portal.",
    art: assets.step4Contacts,
  },
  {
    n: "05",
    icon: "draft-ai" as IconName,
    title: "Every email drafted for you",
    body: "One tailored message per company, citing their work and your matching results. Anything the model had to assume is flagged before you send.",
    art: assets.step5Draft,
  },
  {
    n: "06",
    icon: "pipeline" as IconName,
    title: "Watch the pipeline move",
    body: "Sent, opened, replied, interviewing. Follow-ups queue themselves when a thread goes quiet.",
    art: assets.step6Track,
  },
];

const FEATURES = [
  {
    icon: "target-link" as IconName,
    title: "Matching that reads context",
    body: "A radar over the whole market, not a keyword filter. We rank by how well your experience fits the role, and tell you why each company surfaced.",
    art: assets.featureMatching,
  },
  {
    icon: "send" as IconName,
    title: "Outreach at real volume",
    body: "Hundreds of companies, each with its own draft. Send in batches, throttle per day, and keep every thread in one place.",
    art: assets.featureAutomation,
  },
  {
    icon: "shield-lock" as IconName,
    title: "Your resume stays yours",
    body: "Never sold, listed, or handed to recruiters. Nothing leaves your account until you press send — there is no auto-send, by design.",
    art: assets.featurePrivacy,
  },
  {
    icon: "chart-up" as IconName,
    title: "Know what's working",
    body: "Reply rates by industry, role and template. The drafts get sharper as the data comes back.",
    art: assets.featureAnalytics,
  },
];

/**
 * Customer-facing coverage. How each platform is accessed is an implementation
 * detail and stays out of the marketing copy.
 */
const SOURCES = [
  {
    name: "Y Combinator",
    detail: "Work at a Startup",
    note: "Every batch, every company still hiring — the roles that fill before they reach a job board.",
  },
  {
    name: "Wellfound",
    detail: "formerly AngelList",
    note: "The startup market end to end, from pre-seed teams to companies about to break out.",
  },
  {
    name: "Company career pages",
    detail: "thousands of employers",
    note: "Straight from the source, so you see roles the moment a company posts them.",
  },
  {
    name: "Indeed",
    detail: "the widest net there is",
    note: "The largest job board on the internet into the same sweep.",
  },
];

/* Framed as work removed rather than volume produced — the point is the hours
   you get back, not how many emails went out. */
const STATS = [
  { value: "1", label: "resume, uploaded once" },
  { value: "0", label: "job boards left to check" },
  { value: "0", label: "emails you write yourself" },
];

/** Live coverage only — Indeed is deliberately absent until it actually ships. */
const MARQUEE = [
  "Y Combinator", "Wellfound", "Greenhouse", "Lever", "Ashby",
  "SmartRecruiters", "Work at a Startup",
];

export default async function Home() {
  const user = await currentUser();

  return (
    <>
      <SiteHeader username={user?.username} />

      <main className="flex-1">
        {/* ------------------------------------------------------------- hero */}
        <section className="relative overflow-hidden border-b border-[var(--line)]">
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-5 sm:px-6 pt-16 pb-12 lg:grid-cols-[1fr_1.05fr] lg:pt-20 lg:pb-16">
            <div>
              <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--background)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-[var(--accent)]" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                </span>
                Your AI job-hunting agent
              </p>

              <h1
                className="animate-fade-up mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
                style={{ animationDelay: "80ms" }}
              >
                Stop spending hours
                <br />
                applying for jobs.
              </h1>

              <p
                className="animate-fade-up mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted)]"
                style={{ animationDelay: "160ms" }}
              >
                Let AI find the jobs that actually match your resume — then write the email for
                every one of them. Upload your resume once and approve what goes out. That&apos;s
                the whole job.
              </p>

              <div
                className="animate-fade-up mt-8 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "240ms" }}
              >
                <Link
                  href="/start"
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-[var(--foreground)] px-5 sm:px-6 py-3.5 text-sm font-medium text-[var(--background)] shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
                >
                  <Icon name="resume-upload" className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5" />
                  Start hunting
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-5 sm:px-6 py-3.5 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--subtle)] hover:shadow-[var(--shadow-md)]"
                >
                  See how it works
                </Link>
              </div>

              <dl
                className="animate-fade-up mt-12 flex flex-wrap gap-x-10 gap-y-4"
                style={{ animationDelay: "320ms" }}
              >
                {STATS.map(s => (
                  <div key={s.label}>
                    <dt className="text-2xl font-semibold tracking-tight">{s.value}</dt>
                    <dd className="text-sm text-[var(--muted)]">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="animate-scale-in relative" style={{ animationDelay: "200ms" }}>
              <Image
                src={assets.heroMain.src}
                alt={assets.heroMain.alt}
                width={assets.heroMain.width}
                height={assets.heroMain.height}
                priority
                /* The art was composed with an empty left third for a headline.
                   Anchoring right crops that dead space instead of rendering it. */
                className="art aspect-[4/3] w-full rounded-2xl object-cover object-right lg:aspect-[5/4]"
                sizes="(min-width: 1024px) 55vw, 100vw"
              />
            </div>
          </div>

          {/* Source marquee.
              Two identical halves, each forced to at least the full container
              width. Sizing by content instead would leave a gap whenever the
              names are narrower than the viewport — which is exactly what a
              short list on a wide screen produces. */}
          <div className="group relative overflow-hidden border-t border-[var(--line)] py-5">
            <div className="animate-marquee flex group-hover:[animation-play-state:paused]">
              {[0, 1].map(half => (
                <div
                  key={half}
                  aria-hidden={half === 1}
                  className="flex min-w-full shrink-0 items-center justify-around gap-12 whitespace-nowrap"
                >
                  {MARQUEE.map(name => (
                    <span
                      key={name}
                      className="flex items-center gap-2.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                    >
                      <Icon name="target-link" className="h-3.5 w-3.5" />
                      {name}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            {/* Fades the belt into the page edges instead of cutting it dead. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--background)] to-transparent"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[var(--background)] to-transparent"
            />
          </div>
        </section>

        {/* ---------------------------------------------------------- sources */}
        <section id="sources" className="border-b border-[var(--line)]">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 py-20 lg:py-24">
            <Reveal as="header" className="max-w-2xl">
              <p className="text-sm font-medium text-[var(--muted)]">Sources</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Every platform worth searching, in one pass.
              </h2>
              <p className="mt-4 leading-relaxed text-[var(--muted)]">
                Most people check one job board and stop. We search all of them at once, then
                merge the results into a single list with the duplicates already removed — so you
                never open the same role twice.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SOURCES.map((s, i) => (
                <Reveal key={s.name} delay={i * 90}>
                  <article className="card shimmer group relative h-full overflow-hidden p-7">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--subtle)] transition-colors duration-300 group-hover:border-[var(--foreground)]">
                      <Icon name="company" className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-base font-semibold tracking-tight">{s.name}</h3>
                    <p className="text-sm text-[var(--muted)]">{s.detail}</p>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">{s.note}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- how it works */}
        <section id="how-it-works" className="border-b border-[var(--line)]">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 py-20 lg:py-24">
            <Reveal as="header" className="max-w-2xl">
              <p className="text-sm font-medium text-[var(--muted)]">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                The hours you used to spend, handled.
              </h2>
              <p className="mt-4 text-[var(--muted)]">
                Searching, filtering, tab-juggling, rewriting the same email — the agent does all
                of it. You step in twice: once to upload, once to approve.
              </p>
            </Reveal>

            <ol className="mt-14 space-y-16">
              {STEPS.map((step, i) => (
                <Reveal as="li" key={step.n} className="block">
                  <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                    <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                      <div className="flex items-center gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--line)] font-mono text-sm">
                          {step.n}
                        </span>
                        <span className="h-px flex-1 bg-gradient-to-r from-[var(--line-strong)] to-transparent" />
                        <Icon name={step.icon} className="h-5 w-5 text-[var(--muted)]" />
                      </div>
                      <h3 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{step.title}</h3>
                      <p className="mt-4 max-w-lg leading-relaxed text-[var(--muted)]">{step.body}</p>
                    </div>

                    <div className={i % 2 === 1 ? "lg:order-1" : undefined}>
                      <div className="card group overflow-hidden p-0">
                        <Image
                          src={step.art.src}
                          alt={step.art.alt}
                          width={step.art.width}
                          height={step.art.height}
                          className="art w-full transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                          sizes="(min-width: 1024px) 50vw, 100vw"
                        />
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* --------------------------------------------------------- features */}
        <section id="features" className="relative overflow-hidden border-b border-[var(--line)]">
          <Image
            src={assets.bgGrain.src}
            alt=""
            aria-hidden="true"
            fill
            className="art pointer-events-none object-cover opacity-[0.35]"
            sizes="100vw"
          />
          <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-6 py-20 lg:py-24">
            <Reveal as="header" className="max-w-2xl">
              <p className="text-sm font-medium text-[var(--muted)]">Features</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Matches worth your time, not a longer list.
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-[var(--muted)]">
                Anyone can hand you a thousand job links. The agent reads your actual experience
                and only surfaces roles where you genuinely fit — then tells you why.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 90}>
                  <article className="card group flex h-full flex-col overflow-hidden">
                    <div className="overflow-hidden">
                      <Image
                        src={f.art.src}
                        alt={f.art.alt}
                        width={f.art.width}
                        height={f.art.height}
                        className="art aspect-[16/10] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        sizes="(min-width: 640px) 50vw, 100vw"
                      />
                    </div>
                    <div className="border-t border-[var(--line)] p-7">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--subtle)] transition-colors duration-300 group-hover:border-[var(--foreground)]">
                          <Icon name={f.icon} className="h-5 w-5" />
                        </span>
                        <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                      </div>
                      <p className="mt-4 leading-relaxed text-[var(--muted)]">{f.body}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- pipeline */}
        <section id="pipeline" className="border-b border-[var(--line)]">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 sm:px-6 py-20 lg:grid-cols-2 lg:py-24">
            <Reveal>
              <p className="text-sm font-medium text-[var(--muted)]">The pipeline</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                One board for every thread you opened.
              </h2>
              <p className="mt-4 leading-relaxed text-[var(--muted)]">
                Every company the crawler found, every draft you approved, and every reply that
                came back — in one place, moving left to right. Quiet threads resurface
                themselves with a follow-up ready to go.
              </p>

              <ul className="mt-8 space-y-3">
                {[
                  { icon: "company" as IconName, text: "Companies discovered and ranked by fit" },
                  { icon: "mail-search" as IconName, text: "Careers contact resolved from published sources only" },
                  { icon: "send" as IconName, text: "Drafts queued, throttled and sent on your terms" },
                  { icon: "chart-up" as IconName, text: "Replies tracked, follow-ups scheduled" },
                ].map(item => (
                  <li
                    key={item.text}
                    className="group flex items-start gap-4 rounded-xl border border-transparent p-3 transition-all duration-300 hover:border-[var(--line)] hover:bg-[var(--subtle)]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] transition-colors duration-300 group-hover:border-[var(--foreground)]">
                      <Icon name={item.icon} className="h-4 w-4" />
                    </span>
                    <span className="pt-1.5 text-[var(--muted)]">{item.text}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <video
                src={assets.videoHeroLoop.src}
                className="motion w-full rounded-2xl border border-[var(--line)] shadow-[var(--shadow-md)]"
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
              />
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------------- CTA */}
        <section className="relative overflow-hidden border-b border-[var(--line)]">
          <Image
            src={assets.heroSecondary.src}
            alt=""
            aria-hidden="true"
            fill
            className="art pointer-events-none object-cover opacity-[0.15]"
            sizes="100vw"
          />
          <Reveal className="relative mx-auto w-full max-w-7xl px-5 sm:px-6 py-24 text-center">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Your next role is already posted somewhere.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[var(--muted)]">
              Upload your resume and let the agent find it — and write the email — while you get
              your evenings back.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/start"
                className="group inline-flex items-center gap-2 rounded-xl bg-[var(--foreground)] px-5 sm:px-6 py-3.5 text-sm font-medium text-[var(--background)] shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
              >
                <Icon name="resume-upload" className="h-4 w-4" />
                Start hunting
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--background)] px-5 sm:px-6 py-3.5 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--subtle)] hover:shadow-[var(--shadow-md)]"
              >
                Log in
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

export const dynamic = "force-dynamic";
