"use client";

import { useState } from "react";
import { Chat } from "@/components/Chat";
import { Dashboard } from "@/components/Dashboard";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const [revalidateKey, setRevalidateKey] = useState(0);
  const [chatMaximized, setChatMaximized] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="shrink-0 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-background"
              style={{ boxShadow: "var(--shadow-pop)" }}
            >
              <span className="display text-xl leading-none">P</span>
            </div>
            <div className="leading-tight">
              <div className="display-tight text-base text-foreground">Penny</div>
              <div className="text-[11px] text-muted">your money, friendlier</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-green" />
              connected
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 lg:flex-row">
        {!chatMaximized && (
          <main className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-border bg-panel/40" style={{ boxShadow: "var(--shadow-card)" }}>
            <Dashboard revalidateKey={revalidateKey} />
          </main>
        )}
        <aside
          className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-border bg-panel/40 ${chatMaximized ? "flex-1" : "lg:w-[520px] xl:w-[600px]"}`}
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <Chat
            onMutate={() => setRevalidateKey((k) => k + 1)}
            maximized={chatMaximized}
            onToggleMaximize={() => setChatMaximized((v) => !v)}
          />
        </aside>
      </div>
    </div>
  );
}
