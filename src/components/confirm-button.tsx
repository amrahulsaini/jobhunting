"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";

/**
 * A delete control that asks before it acts.
 *
 * Two-step inline rather than a modal: the confirmation appears in place, and
 * reverts on its own after a few seconds so an abandoned click never leaves a
 * primed destructive button sitting on the page.
 */
export function ConfirmButton({
  onConfirm,
  label = "Delete",
  confirmLabel = "Confirm?",
  busyLabel = "Deleting…",
  variant = "icon",
  className = "",
}: {
  onConfirm: () => void | Promise<void>;
  label?: string;
  confirmLabel?: string;
  busyLabel?: string;
  variant?: "icon" | "text";
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  async function click() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  if (variant === "icon" && !armed && !busy) {
    return (
      <button
        type="button"
        onClick={click}
        aria-label={label}
        title={label}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--muted)] transition-colors hover:border-[var(--foreground)] hover:text-[var(--foreground)] ${className}`}
      >
        <Icon name="trash" className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        armed
          ? "border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
          : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
      } ${className}`}
    >
      {!armed && !busy && <Icon name="trash" className="h-3.5 w-3.5" />}
      {busy ? busyLabel : armed ? confirmLabel : label}
    </button>
  );
}
