"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

type Msg = {
  role: "user" | "assistant";
  content: string;
  tools?: { name: string }[] | null;
};

type ChatSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export function Chat({ onMutate }: { onMutate: () => void }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("chat-sidebar-open");
    if (stored !== null) setSidebarOpen(stored === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem("chat-sidebar-open", sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/chats");
      const list: ChatSummary[] = await res.json();
      setChats(list);
      if (list.length > 0) {
        await selectChat(list[0].id);
      } else {
        await newChat();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToBottom = () =>
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });

  async function selectChat(id: string) {
    setCurrentChatId(id);
    setMessages([]);
    const res = await fetch(`/api/chats/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(
      (data.messages ?? []).map(
        (m: { role: "user" | "assistant"; content: string; tools: { name: string }[] | null }) => ({
          role: m.role,
          content: m.content,
          tools: m.tools,
        }),
      ),
    );
    scrollToBottom();
  }

  async function newChat() {
    const res = await fetch("/api/chats", { method: "POST" });
    const created: ChatSummary = await res.json();
    setChats((prev) => [created, ...prev]);
    setCurrentChatId(created.id);
    setMessages([]);
  }

  async function deleteChat(id: string) {
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (currentChatId === id) {
      const remaining = chats.filter((c) => c.id !== id);
      if (remaining.length > 0) await selectChat(remaining[0].id);
      else await newChat();
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !currentChatId) return;
    setInput("");
    setBusy(true);
    setActiveTool(null);

    const chatId = currentChatId;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", tools: [] },
    ]);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: text }),
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
          } else if (event === "title") {
            setChats((prev) =>
              prev.map((c) =>
                c.id === chatId ? { ...c, title: data.title } : c,
              ),
            );
          } else if (event === "done") {
            setChats((prev) => {
              const idx = prev.findIndex((c) => c.id === chatId);
              if (idx < 0) return prev;
              const updated = {
                ...prev[idx],
                updatedAt: new Date().toISOString(),
              };
              return [updated, ...prev.filter((c) => c.id !== chatId)];
            });
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

  const suggestions = [
    "What's my Ready to Assign?",
    "How much did I spend on groceries this month?",
    "Show uncategorized transactions and suggest categories",
    "Move $50 from Dining Out to Groceries",
  ];

  return (
    <div className="flex h-full">
      {sidebarOpen ? (
        <div className="flex h-full w-56 shrink-0 flex-col border-r border-border/70 bg-panel/30">
          <div className="flex shrink-0 items-center justify-between px-3 py-3">
            <button
              onClick={newChat}
              className="flex-1 rounded-lg border border-border bg-panel px-2 py-1.5 text-left text-xs font-medium text-foreground transition hover:border-border-strong hover:bg-panel-2"
            >
              + New chat
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-1 rounded-md px-1.5 py-1 text-xs text-muted hover:text-foreground"
              title="Collapse"
            >
              «
            </button>
          </div>
          <div className="flex-1 space-y-0.5 overflow-auto px-2 pb-3">
            {chats.map((c) => {
              const isActive = c.id === currentChatId;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
                    isActive
                      ? "bg-panel-2 text-foreground"
                      : "text-muted hover:bg-panel/60 hover:text-foreground"
                  }`}
                >
                  <button
                    onClick={() => selectChat(c.id)}
                    className="flex-1 truncate text-left"
                    title={c.title ?? "New chat"}
                  >
                    {c.title ?? "New chat"}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this chat?")) deleteChat(c.id);
                    }}
                    className="opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-full w-6 shrink-0 items-center justify-center border-r border-border/70 text-xs text-muted hover:bg-panel/40 hover:text-foreground"
          title="Expand chats"
        >
          »
        </button>
      )}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border/70 px-5 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-2">
            Chat
          </div>
          <div className="mt-0.5 text-[11px] text-muted">Claude Opus 4.7</div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-auto px-5 py-4"
        >
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-2">
                Try asking
              </div>
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-lg border border-border bg-panel/60 px-3 py-2 text-left text-sm text-muted transition hover:border-border-strong hover:bg-panel-2 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} />
          ))}

          {busy && activeTool && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              running{" "}
              <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                {activeTool}
              </code>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border/70 p-3">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-panel p-2 transition focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_15%,transparent)]">
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
              className="flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-2 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim() || !currentChatId}
              className="rounded-lg bg-gradient-to-br from-accent to-accent-2 px-3.5 py-1.5 text-xs font-semibold text-background shadow-[0_0_20px_-6px_var(--accent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
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
        className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "whitespace-pre-wrap bg-gradient-to-br from-accent/25 to-accent/10 text-foreground"
            : "space-y-1 border border-border bg-panel/70"
        }`}
      >
        {msg.tools && msg.tools.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {msg.tools.map((t, i) => (
              <span
                key={i}
                className="rounded-md bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-muted"
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
        {msg.content ? (
          isUser ? (
            msg.content
          ) : (
            <Markdown text={msg.content} />
          )
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted italic">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
            thinking…
          </span>
        )}
      </div>
    </div>
  );
}
