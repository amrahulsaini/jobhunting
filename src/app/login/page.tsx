import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to JobHunting to pick up your hunt.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <>
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back.</h1>
          <p className="mt-3 text-[var(--muted)]">Log in with your username or email.</p>

          <div className="card mt-8 p-6 sm:p-7">
            <AuthForm mode="login" />
          </div>

          <p className="mt-8 text-sm text-[var(--muted)]">
            New here?{" "}
            <Link href="/start" className="link-underline text-[var(--foreground)]">
              Create an account
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
