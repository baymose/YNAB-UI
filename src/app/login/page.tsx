"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/",
    });
    if (error) {
      setError(error.message ?? "Something went wrong");
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div
        className="w-full max-w-md rounded-3xl border border-border bg-panel/60 p-8"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-background"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <span className="display text-2xl leading-none">P</span>
          </div>
          <div className="leading-tight">
            <div className="display-tight text-lg text-foreground">Penny</div>
            <div className="text-xs text-muted">your money, friendlier</div>
          </div>
        </div>

        {state === "sent" ? (
          <div className="space-y-3">
            <h1 className="display text-xl">Check your inbox</h1>
            <p className="text-sm text-muted">
              We sent a magic link to <strong>{email}</strong>. Click it to sign
              in.
            </p>
            <button
              type="button"
              className="text-sm text-accent underline"
              onClick={() => {
                setState("idle");
                setEmail("");
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <h1 className="display text-xl">Sign in</h1>
              <p className="mt-1 text-sm text-muted">
                Enter your email and we&apos;ll send you a magic link.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Email</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <button
              type="submit"
              disabled={state === "sending" || !email}
              className="w-full rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
              style={{ boxShadow: "var(--shadow-pop)" }}
            >
              {state === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
