"use client";

import { useState } from "react";
import { Chat } from "@/components/Chat";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const [revalidateKey, setRevalidateKey] = useState(0);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="relative z-10 shrink-0 border-b border-[var(--hairline-strong)] px-8 pt-5 pb-4 backdrop-blur-sm">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-baseline gap-4">
            <div className="kicker hidden sm:block">No. {new Date().getFullYear()} · Vol. I</div>
            <span className="hidden text-muted-2 sm:inline">·</span>
            <div className="kicker">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          </div>
          <div className="hidden items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-muted-2 sm:flex">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green/70" />
            Live ledger
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-6">
          <h1 className="display text-[clamp(2.75rem,5vw,4.25rem)] text-parchment">
            Penny<span className="text-accent">.</span>
          </h1>
          <div className="serif-italic hidden text-base text-muted sm:block">
            a private ledger, kept by Claude
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="min-h-0 flex-1 border-b border-border/60 lg:border-b-0 lg:border-r">
          <Dashboard revalidateKey={revalidateKey} />
        </main>
        <aside className="flex h-full min-h-0 w-full flex-col bg-panel/30 lg:w-[560px] xl:w-[640px]">
          <Chat onMutate={() => setRevalidateKey((k) => k + 1)} />
        </aside>
      </div>
    </div>
  );
}
