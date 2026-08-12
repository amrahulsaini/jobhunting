"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

const FIELD =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--foreground)]";

/**
 * One form, two modes. Signup collects email + username + password; login takes
 * either identifier plus the password, so people who forget which username they
 * chose can still get in with their email.
 */
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const payload =
      mode === "signup"
        ? {
            email: data.get("email"),
            username: data.get("username"),
            password: data.get("password"),
          }
        : { identifier: data.get("identifier"), password: data.get("password") };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json.ok) {
        setError(json.error ?? "Something went wrong.");
        return;
      }

      router.push("/dashboard");
      // The dashboard reads the session server-side, so repaint it.
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the app still running?");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" ? (
        <>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email"
              className={FIELD} placeholder="you@example.com" />
          </div>

          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium">
              Username
            </label>
            <input id="username" name="username" required autoComplete="username"
              minLength={3} maxLength={20} pattern="[A-Za-z0-9_-]{3,20}"
              className={FIELD} placeholder="amansaini" />
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              3–20 characters. Letters, numbers, hyphens and underscores.
            </p>
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium">
            Username or email
          </label>
          <input id="identifier" name="identifier" required autoComplete="username"
            className={FIELD} placeholder="amansaini or you@example.com" />
        </div>
      )}

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <input id="password" name="password" type="password" required minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={FIELD}
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-[var(--foreground)] px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl btn-accent px-6 py-3.5 text-sm font-medium shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] disabled:translate-y-0 disabled:opacity-60"
      >
        {pending
          ? mode === "signup" ? "Creating account…" : "Logging in…"
          : mode === "signup" ? "Create account" : "Log in"}
        {!pending && <Icon name="send" className="h-4 w-4" />}
      </button>
    </form>
  );
}
