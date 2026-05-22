"use client";

import { useState } from "react";
import { Chat } from "@/components/Chat";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const [revalidateKey, setRevalidateKey] = useState(0);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground lg:flex-row">
      <main className="min-h-0 flex-1 border-b border-border lg:border-b-0 lg:border-r">
        <Dashboard revalidateKey={revalidateKey} />
      </main>
      <aside className="flex h-full min-h-0 w-full flex-col bg-panel lg:w-[420px]">
        <Chat onMutate={() => setRevalidateKey((k) => k + 1)} />
      </aside>
    </div>
  );
}
