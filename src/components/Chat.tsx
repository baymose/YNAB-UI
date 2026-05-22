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
        <div className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--hairline-strong)] bg-panel/20">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4 py-4">
            <button
              onClick={newChat}
              className="serif-italic flex-1 text-left text-sm text-accent-2 transition hover:text-parchment"
            >
              + new entry
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-1 px-1.5 py-1 text-xs text-muted-2 hover:text-foreground"
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
                  className={`group flex items-center gap-1 border-l-2 px-3 py-1.5 text-xs transition ${
                    isActive
                      ? "border-accent text-parchment"
                      : "border-transparent text-muted hover:border-[var(--hairline-strong)] hover:text-foreground"
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
        <div className="shrink-0 border-b border-[var(--hairline-strong)] px-7 pt-5 pb-4">
          <div className="kicker mb-1.5">Correspondence</div>
          <div className="flex items-baseline justify-between gap-3">
            <div className="display-roman text-3xl text-parchment">Penny <span className="serif-italic text-accent">replies</span></div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-muted-2">Opus 4.7</div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-auto px-5 py-4"
        >
          {messages.length === 0 && (
            <div className="space-y-5 pt-4 fade-up">
              <div className="flex items-baseline gap-3">
                <span className="kicker">Prompts of the House</span>
                <span className="h-px flex-1 bg-[var(--hairline)]" />
              </div>
              <ol className="flex flex-col">
                {suggestions.map((s, i) => (
                  <li key={s} className="border-b border-[var(--hairline)] last:border-b-0">
                    <button
                      onClick={() => setInput(s)}
                      className="group flex w-full items-baseline gap-4 py-3 text-left transition"
                    >
                      <span className="display-roman num text-xs text-muted-2 w-6 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="serif-italic text-base text-muted transition group-hover:text-parchment">
                        {s}
                      </span>
                      <span className="ml-auto text-muted-2/0 transition group-hover:text-accent">→</span>
                    </button>
                  </li>
                ))}
              </ol>
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

        <div className="shrink-0 border-t border-[var(--hairline-strong)] px-7 py-5">
          <div className="group flex items-end gap-3 border-b border-[var(--hairline-strong)] pb-2 transition focus-within:border-accent">
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
              placeholder="Pose a question to the ledger…"
              disabled={busy}
              className="serif-italic flex-1 resize-none bg-transparent text-lg leading-snug text-parchment outline-none placeholder:text-muted-2 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim() || !currentChatId}
              className="kicker shrink-0 pb-1 text-accent transition hover:text-accent-2 disabled:cursor-not-allowed disabled:opacity-25"
            >
              {busy ? "··· sending" : "Send →"}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] tracking-[0.18em] uppercase text-muted-2">
            <span>Enter to send · Shift+Enter for newline</span>
            <span className="flourish text-xs">❦</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className="fade-up">
      <div className="kicker mb-1.5 flex items-center gap-2">
        <span className={isUser ? "text-accent" : "text-muted-2"}>
          {isUser ? "You wrote" : "Penny replies"}
        </span>
        <span className="h-px w-6 bg-[var(--hairline)]" />
      </div>
      <div
        className={
          isUser
            ? "serif-italic whitespace-pre-wrap text-lg leading-snug text-parchment"
            : "space-y-2 text-[15px] leading-relaxed text-foreground"
        }
      >
        {msg.tools && msg.tools.length > 0 && (
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px] tracking-[0.14em] uppercase text-muted-2">
            <span>consulted</span>
            {msg.tools.map((t, i) => (
              <span key={i} className="font-mono text-muted">
                {t.name}
                {i < msg.tools!.length - 1 ? "," : ""}
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
          <span className="serif-italic inline-flex items-center gap-2 text-muted">
            <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-accent" />
            considering…
          </span>
        )}
      </div>
    </div>
  );
}
