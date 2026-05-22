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

type Tab =
  | "overview"
  | "pacing"
  | "recurring"
  | "payees"
  | "insights"
  | "categories"
  | "transactions";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  pacing: "Pacing",
  recurring: "Recurring",
  payees: "Payees",
  insights: "Insights",
  categories: "Categories",
  transactions: "Transactions",
};

export function Dashboard({ revalidateKey }: { revalidateKey: number }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto p-3">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition ${
              tab === t
                ? "bg-foreground text-background"
                : "text-muted hover:bg-panel-2 hover:text-foreground"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div key={tab} className="flex-1 overflow-auto fade-up">
        {tab === "overview" && <Overview revalidateKey={revalidateKey} />}
        {tab === "pacing" && <Pacing revalidateKey={revalidateKey} />}
        {tab === "recurring" && <Recurring />}
        {tab === "payees" && <Payees />}
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
    <h3 className="display-tight mb-3 text-base text-foreground">
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

  const rta = cats?.ready_to_assign ?? null;
  const rtaDanger = rta != null && rta < 0;

  return (
    <div className="space-y-6 px-6 py-6 fade-up-stagger">
      {/* Hero card — the headline number */}
      <section
        className="card relative overflow-hidden p-7"
        style={{
          background:
            "radial-gradient(600px 280px at 100% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%), linear-gradient(180deg, var(--panel-2), var(--panel))",
        }}
      >
        <div className="text-xs font-medium text-muted">Ready to assign</div>
        <div
          className={`display num mt-2 text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95] ${
            rtaDanger ? "text-red" : "text-foreground"
          }`}
        >
          {rta != null ? (
            fmt(rta)
          ) : (
            <span className="inline-block h-[1em] w-[5ch] skeleton align-middle" />
          )}
        </div>
        <div className="mt-2 text-sm text-muted">
          {rtaDanger ? "You've over-assigned — pull some back." : "Cash waiting for a job."}
        </div>
      </section>

      {/* Supporting stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Age of money"
          value={cats?.age_of_money != null ? `${cats.age_of_money}d` : null}
          hint={cats?.age_of_money != null ? "Average days of cash on hand" : undefined}
        />
        <Stat
          label="On-budget total"
          value={onBudgetTotal != null ? fmt(onBudgetTotal) : null}
        />
      </div>

      {/* Overspending banner */}
      <section className="card flex items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-base ${
              overspentCount > 0
                ? "bg-red/15 text-red"
                : "bg-green/15 text-green"
            }`}
          >
            {overspentCount > 0 ? "!" : "✓"}
          </span>
          <div>
            <div className="display-tight text-sm text-foreground">
              {overspentCount > 0
                ? `${overspentCount} categor${overspentCount === 1 ? "y" : "ies"} overspent`
                : "All categories funded"}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {overspentCount > 0
                ? "Move money to cover before month end."
                : "No overspending this month."}
            </div>
          </div>
        </div>
        <button
          onClick={() => setCoverOpen(true)}
          disabled={overspentCount === 0}
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-background transition hover:bg-accent-2 disabled:cursor-not-allowed disabled:bg-panel-3 disabled:text-muted-2"
          style={overspentCount > 0 ? { boxShadow: "var(--shadow-pop)" } : undefined}
        >
          Cover overspending
        </button>
      </section>

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
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] font-medium text-muted-2">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts?.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-border/60 transition hover:bg-panel-3/40"
                >
                  <td className="px-5 py-3.5 font-medium">{a.name}</td>
                  <td className="px-5 py-3.5 capitalize text-muted">{a.type}</td>
                  <td className="num px-5 py-3.5 text-right">
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
    <div className="card card-interactive p-5">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div
        className={`display num mt-1.5 text-3xl leading-none ${
          danger ? "text-red" : accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value ?? <span className="inline-block h-8 w-24 skeleton align-middle" />}
      </div>
      {hint && <div className="mt-2 text-[11px] text-muted-2">{hint}</div>}
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
      <div className="space-y-3 px-8 py-10">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl skeleton" />
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
    <div className="space-y-8 px-8 py-10">
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
            <div className="rounded-2xl border border-border bg-panel/70 p-4 text-sm text-muted">
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
    <div className="rounded-2xl border border-border bg-panel/70 p-3.5">
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

type Subscription = {
  payee: string;
  amount: number;
  cadence: "weekly" | "monthly" | "yearly";
  occurrences: number;
  last_date: string;
  next_expected: string;
  monthly_cost: number;
  status: "active" | "missing" | "due_soon";
  category_name: string | null;
};
type SubscriptionsResponse = {
  total_monthly: number;
  count: number;
  subscriptions: Subscription[];
};

function Recurring() {
  const { data } = useSWR<SubscriptionsResponse>(
    "/api/insights/subscriptions",
    fetcher,
  );

  if (!data) {
    return (
      <div className="space-y-3 px-8 py-10">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-2xl skeleton" />
        ))}
      </div>
    );
  }

  const missing = data.subscriptions.filter((s) => s.status === "missing");
  const dueSoon = data.subscriptions.filter((s) => s.status === "due_soon");
  const annualized = data.total_monthly * 12;

  return (
    <div className="space-y-8 px-8 py-10">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Monthly recurring"
          value={fmt(data.total_monthly)}
          hint={`${fmt(annualized)} / yr across ${data.count}`}
        />
        <Stat
          label="Due in next 3 days"
          value={String(dueSoon.length)}
          accent={dueSoon.length > 0}
        />
        <Stat
          label="Missing this cycle"
          value={String(missing.length)}
          danger={missing.length > 0}
          hint={missing.length > 0 ? "Charge hasn't posted on schedule" : undefined}
        />
      </div>

      <section>
        <SectionHeader>Detected subscriptions</SectionHeader>
        <div className="overflow-hidden rounded-2xl border border-border bg-panel/70">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-2">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Payee</th>
                <th className="px-4 py-2.5 font-medium">Cadence</th>
                <th className="px-4 py-2.5 text-right font-medium">Charge</th>
                <th className="px-4 py-2.5 text-right font-medium">Per month</th>
                <th className="px-4 py-2.5 font-medium">Next</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.subscriptions.map((s) => (
                <SubRow key={s.payee} s={s} />
              ))}
              {data.subscriptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                    No recurring charges detected in the last 180 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-2">
          Detected from ≥3 same-payee charges within 5% amount tolerance over 180 days.
        </p>
      </section>
    </div>
  );
}

function SubRow({ s }: { s: Subscription }) {
  const statusBadge =
    s.status === "missing"
      ? { label: "Missing", cls: "bg-red/15 text-red" }
      : s.status === "due_soon"
        ? { label: "Due soon", cls: "bg-amber/15 text-amber" }
        : { label: "Active", cls: "bg-green/15 text-green" };

  return (
    <tr className="border-t border-border/60 transition hover:bg-panel-2/60">
      <td className="px-4 py-2.5">
        <div className="font-medium">{s.payee}</div>
        {s.category_name && (
          <div className="text-[11px] text-muted-2">{s.category_name}</div>
        )}
      </td>
      <td className="px-4 py-2.5 capitalize text-muted">
        {s.cadence}
        <span className="text-muted-2"> · {s.occurrences}×</span>
      </td>
      <td className="num px-4 py-2.5 text-right">{fmt(s.amount)}</td>
      <td className="num px-4 py-2.5 text-right text-muted">{fmt(s.monthly_cost)}</td>
      <td className="num px-4 py-2.5 text-muted">{s.next_expected}</td>
      <td className="px-4 py-2.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusBadge.cls}`}
        >
          {statusBadge.label}
        </span>
      </td>
    </tr>
  );
}

type PayeeStat = {
  payee: string;
  this_month: number;
  txn_count: number;
  avg_txn: number;
  last_date: string;
  category_name: string | null;
  monthly: number[];
  six_month_total: number;
  vs_prev_month_pct: number | null;
};
type PayeesResponse = {
  months: string[];
  current_month: string;
  top: PayeeStat[];
  total_this_month: number;
};

function Sparkline({ values, width = 90, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(" ");
  const lastIdx = values.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = height - (values[lastIdx] / max) * height;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
        className="text-accent"
      />
      <circle cx={lastX} cy={lastY} r="2" className="fill-accent" />
    </svg>
  );
}

function Payees() {
  const { data } = useSWR<PayeesResponse>("/api/insights/payees", fetcher);

  if (!data) {
    return (
      <div className="space-y-3 px-8 py-10">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-2xl skeleton" />
        ))}
      </div>
    );
  }

  const monthLabels = data.months.map((m) => {
    const [, mm] = m.split("-");
    return new Date(2000, Number(mm) - 1, 1).toLocaleString("en-US", { month: "short" });
  });

  return (
    <div className="space-y-8 px-8 py-10">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Top-10 spend this month"
          value={fmt(data.top.reduce((s, p) => s + p.this_month, 0))}
          hint={`of ${fmt(data.total_this_month)} total payee spend`}
        />
        <Stat
          label="Tracked payees"
          value={String(data.top.length)}
          hint="Sorted by this month's outflow"
        />
      </div>

      <section>
        <SectionHeader>Top payees · this month</SectionHeader>
        <div className="overflow-hidden rounded-2xl border border-border bg-panel/70">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-2">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Payee</th>
                <th className="px-4 py-2.5 text-right font-medium">This month</th>
                <th className="px-4 py-2.5 text-right font-medium">vs prev</th>
                <th className="px-4 py-2.5 font-medium">
                  {monthLabels[0]} – {monthLabels[monthLabels.length - 1]}
                </th>
                <th className="px-4 py-2.5 text-right font-medium">6-mo total</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((p) => (
                <tr
                  key={p.payee}
                  className="border-t border-border/60 transition hover:bg-panel-2/60"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.payee}</div>
                    <div className="text-[11px] text-muted-2">
                      {p.txn_count}× · avg {fmt(p.avg_txn)}
                      {p.category_name ? ` · ${p.category_name}` : ""}
                    </div>
                  </td>
                  <td className="num px-4 py-2.5 text-right font-medium">
                    {fmt(p.this_month)}
                  </td>
                  <td className="num px-4 py-2.5 text-right">
                    {p.vs_prev_month_pct == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={
                          p.vs_prev_month_pct > 15
                            ? "text-red"
                            : p.vs_prev_month_pct < -15
                              ? "text-green"
                              : "text-muted"
                        }
                      >
                        {p.vs_prev_month_pct > 0 ? "+" : ""}
                        {p.vs_prev_month_pct}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Sparkline values={p.monthly} />
                  </td>
                  <td className="num px-4 py-2.5 text-right text-muted">
                    {fmt(p.six_month_total)}
                  </td>
                </tr>
              ))}
              {data.top.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                    No outflows this month yet.
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

function Categories({ revalidateKey }: { revalidateKey: number }) {
  const { data } = useSWR<CategoriesResponse>(
    ["/api/ynab/categories", revalidateKey],
    ([url]) => fetcher(url as string),
  );

  if (!data) {
    return (
      <div className="space-y-8 px-8 py-10">
        {[0, 1].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border bg-panel/70">
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
    <div className="space-y-8 px-8 py-10">
      {data.groups.map((g) => (
        <section key={g.id}>
          <SectionHeader>{g.name}</SectionHeader>
          <div className="overflow-hidden rounded-2xl border border-border bg-panel/70">
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
    <div className="space-y-6 px-8 py-10">
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
        <div className="rounded-2xl border border-border bg-panel/70 p-4 text-sm text-muted">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" />
          Generating today&apos;s analysis…
        </div>
      )}

      {a && (
        <>
          <div className="rounded-2xl border border-border bg-panel/70 p-4 text-sm leading-relaxed">
            {a.summary}
          </div>
          <div className="space-y-2">
            {a.findings.map((f, i) => (
              <FindingCard key={i} f={f} />
            ))}
            {a.findings.length === 0 && (
              <div className="rounded-2xl border border-border bg-panel/70 p-4 text-sm text-muted">
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
    <div className={`rounded-2xl border p-4 ${tone}`}>
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
    <div className="px-8 py-10">
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
      <div className="overflow-hidden rounded-2xl border border-border bg-panel/70">
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
