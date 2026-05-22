"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ email }: { email?: string | null }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="chip hover:opacity-80 disabled:opacity-50"
      title={email ?? undefined}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
