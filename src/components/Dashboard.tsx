"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { fmt, Money } from "./money";
import { CoverPlanModal } from "./CoverPlanModal";
import type {
  Account,
  CategoriesResponse,
  Transaction,
} from "@/lib/types";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

type Tab = "overview" | "insights" | "categories" | "transactions";

export function Dashboard({ revalidateKey }: { revalidateKey: number }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-border px-4 pt-3">
        {(["overview", "insights", "categories", "transactions"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-4 py-2 text-sm capitalize transition ${
              tab === t
                ? "bg-panel text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "overview" && <Overview revalidateKey={revalidateKey} />}
        {tab === "insights" && <Insights />}
        {tab === "categories" && <Categories revalidateKey={revalidateKey} />}
        {tab === "transactions" && (
          <Transactions revalidateKey={revalidateKey} />
        )}
      </div>
    </div>
  );
}

function Overview({ revalidateKey }: { revalidateKey: number }) {
  const { data: accounts } = useSWR<Account[]>(
    ["/api/ynab/accounts", revalidateKey],
    ([url]) => fetcher(url as string),
  );
  const { data: cats } = useSWR<CategoriesResponse>(
    ["/api/ynab/categories", revalidateKey],
    ([url]) => fetcher(url as string),
  );
  const [coverOpen, setCoverOpen] = useState(false);

  const overspentCount =
    cats?.groups.reduce(
      (n, g) => n + g.categories.filter((c) => c.balance < 0).length,
      0,
    ) ?? 0;

  return (
    <div className="space-y-6 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Ready to Assign"
          value={cats ? fmt(cats.ready_to_assign) : "—"}
          accent
        />
        <Stat
          label="Age of Money"
          value={cats?.age_of_money != null ? `${cats.age_of_money}d` : "—"}
        />
        <Stat
          label="On-budget Total"
          value={
            accounts
              ? fmt(
                  accounts
                    .filter((a) => a.on_budget)
                    .reduce((s, a) => s + a.balance, 0),
                )
              : "—"
          }
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-panel p-3">
        <div className="text-sm">
          {overspentCount > 0 ? (
            <span>
              <span className="font-medium text-red">{overspentCount}</span>{" "}
              category{overspentCount === 1 ? "" : "ies"} overspent
            </span>
          ) : (
            <span className="text-muted">No overspending this month</span>
          )}
        </div>
        <button
          onClick={() => setCoverOpen(true)}
          disabled={overspentCount === 0}
          className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-40"
        >
          Cover overspending
        </button>
      </div>

      {coverOpen && (
        <CoverPlanModal
          onClose={() => setCoverOpen(false)}
          onApplied={() => {
            globalMutate(
              (key) =>
                Array.isArray(key) &&
                typeof key[0] === "string" &&
                key[0].startsWith("/api/ynab/"),
            );
          }}
        />
      )}

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
          Accounts
        </h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel-2 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts?.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-border bg-panel hover:bg-panel-2"
                >
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2 capitalize text-muted">{a.type}</td>
                  <td className="px-3 py-2 text-right">
                    <Money amount={a.balance} />
                  </td>
                </tr>
              ))}
              {!accounts && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Categories({ revalidateKey }: { revalidateKey: number }) {
  const { data } = useSWR<CategoriesResponse>(
    ["/api/ynab/categories", revalidateKey],
    ([url]) => fetcher(url as string),
  );

  if (!data) return <div className="p-4 text-muted">Loading…</div>;

  return (
    <div className="space-y-5 p-4">
      {data.groups.map((g) => (
        <section key={g.id}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            {g.name}
          </h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-panel-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Budgeted</th>
                  <th className="px-3 py-2 text-right">Activity</th>
                  <th className="px-3 py-2 text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                {g.categories.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-border bg-panel hover:bg-panel-2"
                  >
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-right">{fmt(c.budgeted)}</td>
                    <td className="px-3 py-2 text-right">
                      <Money amount={c.activity} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Money amount={c.balance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

type Finding = {
  severity: "info" | "warn" | "alert";
  title: string;
  body: string;
  category?: string | null;
};
type Analysis = {
  generated_at: string;
  summary: string;
  findings: Finding[];
};
type AnalysisResponse = { analysis: Analysis | null; refreshing: boolean };

function Insights() {
  const { data, mutate, isLoading } = useSWR<AnalysisResponse>(
    "/api/analysis",
    fetcher,
    { refreshInterval: (d) => (d?.refreshing ? 5000 : 0) },
  );
  const [running, setRunning] = useState(false);

  const refresh = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/analysis", { method: "POST" });
      const json = (await res.json()) as AnalysisResponse;
      await mutate(json, { revalidate: false });
    } finally {
      setRunning(false);
    }
  };

  const a = data?.analysis;
  const refreshing = data?.refreshing || running;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Daily analysis
          </h3>
          <div className="mt-1 text-xs text-muted">
            {a
              ? `Last run ${new Date(a.generated_at).toLocaleString()}`
              : isLoading
                ? "Loading…"
                : "No analysis yet."}
            {refreshing && a ? " · refreshing…" : ""}
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={running}
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs hover:bg-panel-2 disabled:opacity-50"
        >
          {running ? "Running…" : "Run now"}
        </button>
      </div>

      {!a && refreshing && (
        <div className="rounded-lg border border-border bg-panel p-4 text-sm text-muted">
          Generating today&apos;s analysis…
        </div>
      )}

      {a && (
        <>
          <div className="rounded-lg border border-border bg-panel p-4 text-sm leading-relaxed">
            {a.summary}
          </div>
          <div className="space-y-2">
            {a.findings.map((f, i) => (
              <FindingCard key={i} f={f} />
            ))}
            {a.findings.length === 0 && (
              <div className="rounded-lg border border-border bg-panel p-4 text-sm text-muted">
                Nothing to flag right now.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FindingCard({ f }: { f: Finding }) {
  const tone =
    f.severity === "alert"
      ? "border-red/40 bg-red/5"
      : f.severity === "warn"
        ? "border-accent/40 bg-accent/5"
        : "border-border bg-panel";
  const badgeTone =
    f.severity === "alert"
      ? "bg-red/15 text-red"
      : f.severity === "warn"
        ? "bg-accent/15 text-accent"
        : "bg-panel-2 text-muted";
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badgeTone}`}
        >
          {f.severity}
        </span>
        <h4 className="text-sm font-medium">{f.title}</h4>
        {f.category && (
          <span className="text-xs text-muted">· {f.category}</span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-muted">{f.body}</p>
    </div>
  );
}

function Transactions({ revalidateKey }: { revalidateKey: number }) {
  const [filter, setFilter] = useState<"all" | "uncategorized" | "unapproved">(
    "all",
  );
  const qs = filter === "all" ? "" : `?type=${filter}`;
  const { data } = useSWR<Transaction[]>(
    [`/api/ynab/transactions${qs}`, revalidateKey],
    ([url]) => fetcher(url as string),
  );

  return (
    <div className="p-4">
      <div className="mb-3 flex gap-2">
        {(["all", "uncategorized", "unapproved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md border px-3 py-1 text-xs capitalize transition ${
              filter === f
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-panel-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Payee</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <tr
                key={t.id}
                className="border-t border-border bg-panel hover:bg-panel-2"
              >
                <td className="px-3 py-2 text-muted">{t.date}</td>
                <td className="px-3 py-2">{t.payee_name || "—"}</td>
                <td className="px-3 py-2 text-muted">
                  {t.category_name || (
                    <span className="text-red">uncategorized</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted">{t.account_name}</td>
                <td className="px-3 py-2 text-right">
                  <Money amount={t.amount} />
                </td>
              </tr>
            ))}
            {!data && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
