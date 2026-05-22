import { listTransactions } from "@/lib/ynab-api";

export const runtime = "nodejs";

type Sub = {
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

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

function addDays(date: string, n: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function detectCadence(gaps: number[]): Sub["cadence"] | null {
  if (gaps.length === 0) return null;
  const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (median >= 5 && median <= 9) return "weekly";
  if (median >= 26 && median <= 35) return "monthly";
  if (median >= 350 && median <= 380) return "yearly";
  return null;
}

function cadenceDays(c: Sub["cadence"]): number {
  return c === "weekly" ? 7 : c === "monthly" ? 30 : 365;
}

export async function GET() {
  const since = new Date(Date.now() - 180 * DAY_MS).toISOString().slice(0, 10);
  const txns = await listTransactions({ since_date: since, limit: 5000 });

  const today = new Date().toISOString().slice(0, 10);

  const byPayee = new Map<
    string,
    Array<{ date: string; amount: number; category_name: string | null }>
  >();
  for (const t of txns) {
    if (!t.payee_name) continue;
    if (t.amount >= 0) continue;
    const key = t.payee_name;
    if (!byPayee.has(key)) byPayee.set(key, []);
    byPayee.get(key)!.push({
      date: t.date,
      amount: t.amount,
      category_name: t.category_name,
    });
  }

  const subs: Sub[] = [];

  for (const [payee, rows] of byPayee) {
    if (rows.length < 3) continue;
    rows.sort((a, b) => (a.date < b.date ? -1 : 1));

    const amounts = rows.map((r) => Math.abs(r.amount));
    const mean = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    const maxDev = Math.max(...amounts.map((a) => Math.abs(a - mean)));
    const tolerance = Math.max(1, mean * 0.05);
    if (maxDev > tolerance) continue;

    const gaps: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      gaps.push(daysBetween(rows[i - 1].date, rows[i].date));
    }
    const cadence = detectCadence(gaps);
    if (!cadence) continue;

    const expectedGap = cadenceDays(cadence);
    const consistent =
      gaps.filter((g) => Math.abs(g - expectedGap) <= expectedGap * 0.25).length /
      gaps.length;
    if (consistent < 0.6) continue;

    const last = rows[rows.length - 1];
    const nextExpected = addDays(last.date, expectedGap);
    const daysOverdue = daysBetween(nextExpected, today);

    let status: Sub["status"];
    if (daysOverdue > expectedGap * 0.25) status = "missing";
    else if (daysOverdue >= -3) status = "due_soon";
    else status = "active";

    const monthly_cost =
      cadence === "weekly"
        ? (mean * 52) / 12
        : cadence === "yearly"
          ? mean / 12
          : mean;

    subs.push({
      payee,
      amount: Number(mean.toFixed(2)),
      cadence,
      occurrences: rows.length,
      last_date: last.date,
      next_expected: nextExpected,
      monthly_cost: Number(monthly_cost.toFixed(2)),
      status,
      category_name: last.category_name,
    });
  }

  subs.sort((a, b) => b.monthly_cost - a.monthly_cost);

  const totalMonthly = subs.reduce((s, x) => s + x.monthly_cost, 0);

  return Response.json({
    total_monthly: Number(totalMonthly.toFixed(2)),
    count: subs.length,
    subscriptions: subs,
  });
}
