"use client";

import { useState } from "react";
import { Chat } from "@/components/Chat";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const [revalidateKey, setRevalidateKey] = useState(0);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-border/70 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-background shadow-[0_0_24px_-4px_var(--accent)]">
            <span className="text-sm font-bold">S</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Scott</div>
            <div className="text-[11px] text-muted">YNAB agent</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-[11px] text-muted sm:flex">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green shadow-[0_0_8px_var(--green)]" />
          Live
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="min-h-0 flex-1 border-b border-border/70 lg:border-b-0 lg:border-r">
          <Dashboard revalidateKey={revalidateKey} />
        </main>
        <aside className="flex h-full min-h-0 w-full flex-col bg-panel/40 lg:w-[560px] xl:w-[640px]">
          <Chat onMutate={() => setRevalidateKey((k) => k + 1)} />
        </aside>
      </div>
    </div>
  );
}
