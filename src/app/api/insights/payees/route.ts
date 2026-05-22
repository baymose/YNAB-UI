import { listTransactions } from "@/lib/ynab-api";

export const runtime = "nodejs";

const DAY_MS = 86_400_000;

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

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function lastNMonthKeys(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.unshift(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export async function GET() {
  const since = new Date(Date.now() - 200 * DAY_MS).toISOString().slice(0, 10);
  const txns = await listTransactions({ since_date: since, limit: 5000 });

  const months = lastNMonthKeys(6);
  const currentMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];

  const byPayee = new Map<
    string,
    {
      perMonth: Map<string, number>;
      perMonthCount: Map<string, number>;
      lastDate: string;
      categoryName: string | null;
    }
  >();

  for (const t of txns) {
    if (!t.payee_name) continue;
    if (t.amount >= 0) continue;
    const key = t.payee_name;
    const mk = monthKey(t.date);
    if (!byPayee.has(key)) {
      byPayee.set(key, {
        perMonth: new Map(),
        perMonthCount: new Map(),
        lastDate: t.date,
        categoryName: t.category_name,
      });
    }
    const entry = byPayee.get(key)!;
    entry.perMonth.set(mk, (entry.perMonth.get(mk) ?? 0) + Math.abs(t.amount));
    entry.perMonthCount.set(mk, (entry.perMonthCount.get(mk) ?? 0) + 1);
    if (t.date > entry.lastDate) {
      entry.lastDate = t.date;
      entry.categoryName = t.category_name;
    }
  }

  const stats: PayeeStat[] = [];
  for (const [payee, e] of byPayee) {
    const thisMonth = e.perMonth.get(currentMonth) ?? 0;
    if (thisMonth === 0) continue;
    const prev = e.perMonth.get(prevMonth) ?? 0;
    const monthly = months.map((m) => Number((e.perMonth.get(m) ?? 0).toFixed(2)));
    const sixMonthTotal = monthly.reduce((s, n) => s + n, 0);
    const txnCount = e.perMonthCount.get(currentMonth) ?? 0;
    stats.push({
      payee,
      this_month: Number(thisMonth.toFixed(2)),
      txn_count: txnCount,
      avg_txn: Number((thisMonth / Math.max(1, txnCount)).toFixed(2)),
      last_date: e.lastDate,
      category_name: e.categoryName,
      monthly,
      six_month_total: Number(sixMonthTotal.toFixed(2)),
      vs_prev_month_pct:
        prev > 0 ? Number((((thisMonth - prev) / prev) * 100).toFixed(0)) : null,
    });
  }

  stats.sort((a, b) => b.this_month - a.this_month);

  return Response.json({
    months,
    current_month: currentMonth,
    top: stats.slice(0, 10),
    total_this_month: Number(
      stats.reduce((s, x) => s + x.this_month, 0).toFixed(2),
    ),
  });
}
