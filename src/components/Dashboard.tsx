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

type Tab = "overview" | "pacing" | "insights" | "categories" | "transactions";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  pacing: "Pacing",
  insights: "Insights",
  categories: "Categories",
  transactions: "Transactions",
};

export function Dashboard({ revalidateKey }: { revalidateKey: number }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border/70 px-5 pt-3">
        <div className="flex gap-1 rounded-lg bg-panel/60 p-1">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                tab === t
                  ? "bg-panel-2 text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "overview" && <Overview revalidateKey={revalidateKey} />}
        {tab === "pacing" && <Pacing revalidateKey={revalidateKey} />}
        {tab === "insights" && <Insights />}
        {tab === "categories" && <Categories revalidateKey={revalidateKey} />}
        {tab === "transactions" && (
          <Transactions revalidateKey={revalidateKey} />
        )}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">
      {children}
    </h3>
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

  const onBudgetTotal = accounts
    ? accounts.filter((a) => a.on_budget).reduce((s, a) => s + a.balance, 0)
    : null;

  return (
    <div className="space-y-6 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Ready to Assign"
          value={cats ? fmt(cats.ready_to_assign) : null}
          accent={cats ? cats.ready_to_assign >= 0 : false}
          danger={cats ? cats.ready_to_assign < 0 : false}
        />
        <Stat
          label="Age of Money"
          value={cats?.age_of_money != null ? `${cats.age_of_money}d` : null}
          hint={cats?.age_of_money != null ? "Average days of cash on hand" : undefined}
        />
        <Stat
          label="On-budget Total"
          value={onBudgetTotal != null ? fmt(onBudgetTotal) : null}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-panel/70 p-4">
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`grid h-8 w-8 place-items-center rounded-full ${
              overspentCount > 0 ? "bg-red/15 text-red" : "bg-green/15 text-green"
            }`}
          >
            {overspentCount > 0 ? "!" : "✓"}
          </span>
          <div>
            {overspentCount > 0 ? (
              <>
                <div className="font-medium">
                  {overspentCount} categor{overspentCount === 1 ? "y" : "ies"} overspent
                </div>
                <div className="text-xs text-muted">
                  Move money to cover before month end
                </div>
              </>
            ) : (
              <>
                <div className="font-medium">All categories funded</div>
                <div className="text-xs text-muted">No overspending this month</div>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setCoverOpen(true)}
          disabled={overspentCount === 0}
          className="rounded-md border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-30"
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
        <SectionHeader>Accounts</SectionHeader>
        <div className="overflow-hidden rounded-xl border border-border bg-panel/70">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-2">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts?.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-border/60 transition hover:bg-panel-2/60"
                >
                  <td className="px-4 py-2.5">{a.name}</td>
                  <td className="px-4 py-2.5 capitalize text-muted">{a.type}</td>
                  <td className="num px-4 py-2.5 text-right">
                    <Money amount={a.balance} />
                  </td>
                </tr>
              ))}
              {!accounts && <SkeletonRows cols={3} />}
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
  danger,
  hint,
}: {
  label: string;
  value: string | null;
  accent?: boolean;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-panel/70 p-4 transition hover:border-border-strong">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-2">
        {label}
      </div>
      <div
        className={`num mt-1.5 text-2xl font-semibold tracking-tight ${
          danger ? "text-red" : accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value ?? <span className="inline-block h-7 w-24 rounded skeleton align-middle" />}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-2">{hint}</div>}
    </div>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="border-t border-border/60">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-3 w-full max-w-[140px] rounded skeleton" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

type PacingRow = {
  id: string;
  name: string;
  group: string;
  budgeted: number;
  spent: number;
  balance: number;
  pctSpent: number;
  pctElapsed: number;
  dailyPace: number;
  projected: number;
  overage: number;
  daysUntilEmpty: number | null;
  status: "over" | "risk" | "ahead" | "ok" | "idle";
};

function computePacing(cats: CategoriesResponse): {
  rows: PacingRow[];
  daysElapsed: number;
  daysInMonth: number;
  daysLeft: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysLeft = Math.max(0, daysInMonth - daysElapsed);
  const pctElapsed = daysElapsed / daysInMonth;

  const rows: PacingRow[] = [];
  for (const g of cats.groups) {
    if (g.name === "Internal Master Category" || g.name === "Credit Card Payments") continue;
    for (const c of g.categories) {
      if (c.budgeted <= 0 && c.activity === 0) continue;
      const spent = Math.max(0, -c.activity);
      const pctSpent = c.budgeted > 0 ? spent / c.budgeted : 0;
      const dailyPace = daysElapsed > 0 ? spent / daysElapsed : 0;
      const projected = dailyPace * daysInMonth;
      const overage = projected - c.budgeted;
      const daysUntilEmpty =
        dailyPace > 0 && c.balance > 0 ? c.balance / dailyPace : null;

      let status: PacingRow["status"];
      if (c.balance < 0) status = "over";
      else if (c.budgeted === 0) status = "idle";
      else if (daysUntilEmpty !== null && daysUntilEmpty < daysLeft) status = "risk";
      else if (pctSpent < pctElapsed - 0.1) status = "ahead";
      else status = "ok";

      rows.push({
        id: c.id,
        name: c.name,
        group: g.name,
        budgeted: c.budgeted,
        spent,
        balance: c.balance,
        pctSpent,
        pctElapsed,
        dailyPace,
        projected,
        overage,
        daysUntilEmpty,
        status,
      });
    }
  }

  const rank = { over: 0, risk: 1, ok: 2, ahead: 3, idle: 4 };
  rows.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.overage - a.overage;
  });

  return { rows, daysElapsed, daysInMonth, daysLeft };
}

function Pacing({ revalidateKey }: { revalidateKey: number }) {
  const { data } = useSWR<CategoriesResponse>(
    ["/api/ynab/categories", revalidateKey],
    ([url]) => fetcher(url as string),
  );

  if (!data) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl skeleton" />
        ))}
      </div>
    );
  }

  const { rows, daysElapsed, daysInMonth, daysLeft } = computePacing(data);
  const atRisk = rows.filter((r) => r.status === "over" || r.status === "risk");
  const totalProjectedOverage = atRisk.reduce(
    (s, r) => s + Math.max(0, r.overage),
    0,
  );

  return (
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Day of month"
          value={`${daysElapsed} / ${daysInMonth}`}
          hint={`${daysLeft} days remaining`}
        />
        <Stat
          label="At-risk categories"
          value={String(atRisk.length)}
          danger={atRisk.length > 0}
        />
        <Stat
          label="Projected overage"
          value={fmt(totalProjectedOverage)}
          danger={totalProjectedOverage > 0}
          hint="If current pace holds through month end"
        />
      </div>

      <section>
        <SectionHeader>Category burn-down</SectionHeader>
        <div className="space-y-2">
          {rows.map((r) => (
            <PacingCard key={r.id} row={r} />
          ))}
          {rows.length === 0 && (
            <div className="rounded-xl border border-border bg-panel/70 p-4 text-sm text-muted">
              No active categories this month.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PacingCard({ row }: { row: PacingRow }) {
  const pct = Math.min(1, row.pctSpent);
  const paceMark = Math.min(1, row.pctElapsed);

  const barColor =
    row.status === "over"
      ? "bg-red"
      : row.status === "risk"
        ? "bg-amber"
        : row.status === "ahead"
          ? "bg-green"
          : "bg-accent";

  const statusBadge: Record<PacingRow["status"], { label: string; cls: string }> = {
    over: { label: "Overspent", cls: "bg-red/15 text-red" },
    risk: { label: "Will overspend", cls: "bg-amber/15 text-amber" },
    ahead: { label: "Under pace", cls: "bg-green/15 text-green" },
    ok: { label: "On track", cls: "bg-panel-2 text-muted" },
    idle: { label: "No budget", cls: "bg-panel-2 text-muted" },
  };
  const badge = statusBadge[row.status];

  const daysHint =
    row.status === "over"
      ? `${fmt(-row.balance)} over`
      : row.daysUntilEmpty !== null
        ? `~${Math.floor(row.daysUntilEmpty)}d left at this pace`
        : row.budgeted > 0
          ? "no spend yet"
          : "—";

  return (
    <div className="rounded-xl border border-border bg-panel/70 p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{row.name}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          <div className="text-[11px] text-muted-2">{row.group}</div>
        </div>
        <div className="num shrink-0 text-right text-xs text-muted">
          <div>
            {fmt(row.spent)} <span className="text-muted-2">/ {fmt(row.budgeted)}</span>
          </div>
          <div className="text-[11px] text-muted-2">{daysHint}</div>
        </div>
      </div>

      <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-panel-2">
        <div
          className={`absolute inset-y-0 left-0 ${barColor}`}
          style={{ width: `${pct * 100}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-foreground/70"
          style={{ left: `${paceMark * 100}%` }}
          title="Today (linear pace)"
        />
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-muted-2">
        <span>{Math.round(row.pctSpent * 100)}% spent</span>
        <span>
          {row.overage > 0
            ? `proj. ${fmt(row.overage)} over`
            : row.budgeted > 0
              ? `proj. ${fmt(-row.overage)} under`
              : ""}
        </span>
      </div>
    </div>
  );
}

function Categories({ revalidateKey }: { revalidateKey: number }) {
  const { data } = useSWR<CategoriesResponse>(
    ["/api/ynab/categories", revalidateKey],
    ([url]) => fetcher(url as string),
  );

  if (!data) {
    return (
      <div className="space-y-5 p-5">
        {[0, 1].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-panel/70">
            <table className="w-full text-sm">
              <tbody>
                <SkeletonRows cols={4} />
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5">
      {data.groups.map((g) => (
        <section key={g.id}>
          <SectionHeader>{g.name}</SectionHeader>
          <div className="overflow-hidden rounded-xl border border-border bg-panel/70">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-2">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 text-right font-medium">Budgeted</th>
                  <th className="px-4 py-2.5 text-right font-medium">Activity</th>
                  <th className="px-4 py-2.5 text-right font-medium">Available</th>
                </tr>
              </thead>
              <tbody>
                {g.categories.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-border/60 transition hover:bg-panel-2/60"
                  >
                    <td className="px-4 py-2.5">{c.name}</td>
                    <td className="num px-4 py-2.5 text-right text-muted">
                      {fmt(c.budgeted)}
                    </td>
                    <td className="num px-4 py-2.5 text-right">
                      <Money amount={c.activity} />
                    </td>
                    <td className="num px-4 py-2.5 text-right font-medium">
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
    <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionHeader>Daily analysis</SectionHeader>
          <div className="text-xs text-muted">
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
          className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs hover:border-border-strong hover:bg-panel-2 disabled:opacity-50"
        >
          {running ? "Running…" : "Run now"}
        </button>
      </div>

      {!a && refreshing && (
        <div className="rounded-xl border border-border bg-panel/70 p-4 text-sm text-muted">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" />
          Generating today&apos;s analysis…
        </div>
      )}

      {a && (
        <>
          <div className="rounded-xl border border-border bg-panel/70 p-4 text-sm leading-relaxed">
            {a.summary}
          </div>
          <div className="space-y-2">
            {a.findings.map((f, i) => (
              <FindingCard key={i} f={f} />
            ))}
            {a.findings.length === 0 && (
              <div className="rounded-xl border border-border bg-panel/70 p-4 text-sm text-muted">
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
      ? "border-red/40 bg-red/[0.06]"
      : f.severity === "warn"
        ? "border-amber/40 bg-amber/[0.06]"
        : "border-border bg-panel/70";
  const badgeTone =
    f.severity === "alert"
      ? "bg-red/15 text-red"
      : f.severity === "warn"
        ? "bg-amber/15 text-amber"
        : "bg-panel-2 text-muted";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeTone}`}
        >
          {f.severity}
        </span>
        <h4 className="text-sm font-medium">{f.title}</h4>
        {f.category && (
          <span className="text-xs text-muted-2">· {f.category}</span>
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
    <div className="p-5">
      <div className="mb-3 flex gap-1 rounded-lg bg-panel/60 p-1">
        {(["all", "uncategorized", "unapproved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
              filter === f
                ? "bg-panel-2 text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-panel/70">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-2">
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Payee</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <tr
                key={t.id}
                className="border-t border-border/60 transition hover:bg-panel-2/60"
              >
                <td className="num px-4 py-2.5 text-muted">{t.date}</td>
                <td className="px-4 py-2.5">{t.payee_name || "—"}</td>
                <td className="px-4 py-2.5 text-muted">
                  {t.category_name || (
                    <span className="text-red">uncategorized</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted">{t.account_name}</td>
                <td className="num px-4 py-2.5 text-right">
                  <Money amount={t.amount} />
                </td>
              </tr>
            ))}
            {!data && <SkeletonRows cols={5} />}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
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
