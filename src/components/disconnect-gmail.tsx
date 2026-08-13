"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";

export function DisconnectGmail() {
  const router = useRouter();

  return (
    <ConfirmButton
      variant="text"
      label="Disconnect"
      confirmLabel="Disconnect Gmail?"
      busyLabel="Disconnecting…"
      onConfirm={async () => {
        await fetch("/api/gmail/messages", { method: "DELETE" });
        router.refresh();
      }}
      className="px-4 py-2.5 text-sm"
    />
  );
}
