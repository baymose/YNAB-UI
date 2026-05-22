"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

type Msg = {
  role: "user" | "assistant";
  content: string;
  tools?: { name: string }[] | null;
};

type Toast = {
  id: number;
  title: string;
  detail: string;
};

type ChatSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export function Chat({
  onMutate,
  maximized = false,
  onToggleMaximize,
}: {
  onMutate: () => void;
  maximized?: boolean;
  onToggleMaximize?: () => void;
}) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function pushToast(title: string, detail: string) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, detail }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }
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
            const summary = data?.summary as
              | { title?: string; detail?: string }
              | null
              | undefined;
            if (summary && summary.title) {
              pushToast(summary.title, summary.detail ?? "");
            }
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
    <div className="relative flex h-full">
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto fade-up rounded-2xl border border-accent/40 bg-panel p-3 shadow-lg"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-background">
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-foreground">{t.title}</div>
                {t.detail && (
                  <div className="mt-0.5 break-words text-xs text-muted">{t.detail}</div>
                )}
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-muted-2 hover:text-foreground"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      {sidebarOpen ? (
        <div className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-panel/40">
          <div className="flex shrink-0 items-center gap-2 p-3">
            <button
              onClick={newChat}
              className="flex flex-1 items-center gap-2 rounded-2xl bg-panel-3 px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-border"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-background">+</span>
              New chat
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-xl px-2 py-1.5 text-xs text-muted-2 hover:bg-panel-2 hover:text-foreground"
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
                  className={`group flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs transition ${
                    isActive
                      ? "bg-panel-3 text-foreground"
                      : "text-muted hover:bg-panel-2 hover:text-foreground"
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
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="display-tight text-base text-foreground">Chat</div>
          <div className="flex items-center gap-2">
            <div className="chip">Sonnet 4.6</div>
            {onToggleMaximize && (
              <button
                onClick={onToggleMaximize}
                title={maximized ? "Restore chat" : "Maximize chat"}
                aria-label={maximized ? "Restore chat" : "Maximize chat"}
                className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-panel-2 hover:text-foreground"
              >
                {maximized ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 3v4a2 2 0 0 1-2 2H3" />
                    <path d="M15 3v4a2 2 0 0 0 2 2h4" />
                    <path d="M9 21v-4a2 2 0 0 0-2-2H3" />
                    <path d="M15 21v-4a2 2 0 0 1 2-2h4" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9V5a2 2 0 0 1 2-2h4" />
                    <path d="M21 9V5a2 2 0 0 0-2-2h-4" />
                    <path d="M3 15v4a2 2 0 0 0 2 2h4" />
                    <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-auto px-5 py-4"
        >
          {messages.length === 0 && (
            <div className="space-y-3 pt-2 fade-up">
              <div className="text-xs font-medium text-muted-2">Try asking</div>
              <div className="grid grid-cols-1 gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="group card card-interactive flex items-center justify-between gap-3 p-3.5 text-left text-sm text-muted transition hover:text-foreground"
                  >
                    <span>{s}</span>
                    <span className="text-muted-2 transition group-hover:translate-x-0.5 group-hover:text-accent">→</span>
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

        <div className="shrink-0 p-3">
          <div className="card flex items-end gap-2 p-2 transition focus-within:border-accent/60">
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
              placeholder="Ask Penny anything about your money…"
              disabled={busy}
              className="flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-snug text-foreground outline-none placeholder:text-muted-2 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim() || !currentChatId}
              className="shrink-0 rounded-2xl bg-accent px-4 py-2 text-xs font-semibold text-background transition hover:bg-accent-2 disabled:cursor-not-allowed disabled:bg-panel-3 disabled:text-muted-2"
              style={!busy && input.trim() ? { boxShadow: "var(--shadow-pop)" } : undefined}
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
    <div className={`flex fade-up ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "whitespace-pre-wrap rounded-3xl rounded-br-lg bg-accent text-background"
            : "card space-y-1 rounded-3xl rounded-bl-lg"
        }`}
        style={isUser ? { boxShadow: "var(--shadow-pop)" } : undefined}
      >
        {msg.tools && msg.tools.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {msg.tools.map((t, i) => (
              <span
                key={i}
                className="rounded-full bg-panel-3 px-2 py-0.5 font-mono text-[10px] text-muted"
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
          <span className="inline-flex items-center gap-2 italic text-muted">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            thinking…
          </span>
        )}
      </div>
    </div>
  );
}
