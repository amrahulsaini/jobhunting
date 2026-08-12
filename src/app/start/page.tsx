import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Icon } from "@/components/icon";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Start hunting",
  description: "Create your JobHunting account and let AI find the roles that match your resume.",
};

// Reads the session cookie, so it can never be statically prerendered.
export const dynamic = "force-dynamic";

export default async function StartPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <>
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Start hunting.</h1>
          <p className="mt-3 text-[var(--muted)]">
            Create your account, then add your resume and let the agent go to work.
          </p>

          <div className="card mt-8 p-6 sm:p-7">
            <AuthForm mode="signup" />
          </div>

          <ul className="mt-8 space-y-2.5 text-sm text-[var(--muted)]">
            {[
              "Your resume is never sold or shared with recruiters.",
              "Nothing is emailed until you approve each draft.",
            ].map(text => (
              <li key={text} className="flex items-start gap-3">
                <Icon name="shield-lock" className="mt-0.5 h-4 w-4 shrink-0" />
                {text}
              </li>
            ))}
          </ul>

          <p className="mt-8 text-sm text-[var(--muted)]">
            Already have an account?{" "}
            <Link href="/login" className="link-underline text-[var(--foreground)]">
              Log in
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
