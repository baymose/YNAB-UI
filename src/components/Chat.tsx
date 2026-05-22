"use client";

import { useRef, useState } from "react";

type Msg = {
  role: "user" | "assistant";
  content: string;
  tools?: { name: string; result?: unknown }[];
};

export function Chat({ onMutate }: { onMutate: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () =>
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setActiveTool(null);

    const next: Msg[] = [
      ...messages,
      { role: "user", content: text },
      { role: "assistant", content: "", tools: [] },
    ];
    setMessages(next);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next
            .slice(0, -1)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const block of events) {
          const lines = block.split("\n");
          const evtLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (!evtLine || !dataLine) continue;
          const event = evtLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6));

          if (event === "text") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = {
                ...last,
                content: (last.content || "") + data.text,
              };
              return copy;
            });
            setActiveTool(null);
            scrollToBottom();
          } else if (event === "tool_use") {
            setActiveTool(data.name);
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = {
                ...last,
                tools: [...(last.tools ?? []), { name: data.name }],
              };
              return copy;
            });
          } else if (event === "tool_result") {
            setActiveTool(null);
          } else if (event === "done") {
            if (data.mutated) onMutate();
          } else if (event === "error") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = {
                ...last,
                content:
                  (last.content || "") + `\n\n⚠️ Error: ${data.message}`,
              };
              return copy;
            });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `⚠️ ${message}` },
      ]);
    } finally {
      setBusy(false);
      setActiveTool(null);
      scrollToBottom();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="text-sm font-medium">Scott</div>
        <div className="text-xs text-muted">YNAB agent · Claude Opus 4.7</div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2 text-sm text-muted">
            <div>Try:</div>
            <ul className="list-inside list-disc space-y-1">
              <li>What&apos;s my Ready to Assign?</li>
              <li>How much did I spend on groceries this month?</li>
              <li>Show my uncategorized transactions and suggest categories</li>
              <li>Move $50 from Dining Out to Groceries this month</li>
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}

        {busy && activeTool && (
          <div className="text-xs text-muted">
            <span className="inline-block animate-pulse">●</span>{" "}
            running <code className="text-accent">{activeTool}</code>…
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask about your budget…"
            disabled={busy}
            className="flex-1 resize-none rounded-md border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-accent/20 text-foreground"
            : "bg-panel border border-border"
        }`}
      >
        {msg.tools && msg.tools.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1 text-[10px] text-muted">
            {msg.tools.map((t, i) => (
              <span
                key={i}
                className="rounded bg-panel-2 px-1.5 py-0.5 font-mono"
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
        {msg.content || (
          <span className="text-muted italic">thinking…</span>
        )}
      </div>
    </div>
  );
}
