import { BUDGET_ID, ynabClient } from "./ynab";
import type {
  Account,
  CategoriesResponse,
  Category,
  CategoryGroup,
  Transaction,
} from "./types";

const milli = (n: number | null | undefined): number =>
  n == null ? 0 : Number((n / 1000).toFixed(2));

const dollarsToMilli = (n: number): number => Math.round(n * 1000);

export async function getBudgetSummary() {
  const api = ynabClient();
  const { data } = await api.plans.getPlanById(BUDGET_ID);
  const b = data.plan;
  return {
    id: b.id,
    name: b.name,
    currency: b.currency_format?.iso_code ?? "USD",
    last_modified_on: b.last_modified_on ?? null,
    first_month: b.first_month ?? null,
    last_month: b.last_month ?? null,
    accounts_count: (b.accounts ?? []).filter((a) => !a.deleted && !a.closed).length,
    transactions_count: (b.transactions ?? []).length,
    category_groups: (b.category_groups ?? [])
      .filter((g) => !g.deleted && !g.hidden)
      .map((g) => g.name),
  };
}

export async function getAccounts(): Promise<Account[]> {
  const api = ynabClient();
  const { data } = await api.accounts.getAccounts(BUDGET_ID);
  return data.accounts
    .filter((a) => !a.deleted && !a.closed)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      on_budget: a.on_budget,
      balance: milli(a.balance),
      cleared_balance: milli(a.cleared_balance),
      uncleared_balance: milli(a.uncleared_balance),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCategories(): Promise<CategoriesResponse> {
  const api = ynabClient();
  const [{ data: catsData }, { data: monthData }] = await Promise.all([
    api.categories.getCategories(BUDGET_ID),
    api.months.getPlanMonth(BUDGET_ID, "current"),
  ]);
  const groups: CategoryGroup[] = catsData.category_groups
    .filter((g) => !g.deleted && !g.hidden)
    .map((g) => ({
      id: g.id,
      name: g.name,
      categories: g.categories
        .filter((c) => !c.deleted && !c.hidden)
        .map((c): Category => ({
          id: c.id,
          name: c.name,
          budgeted: milli(c.budgeted),
          activity: milli(c.activity),
          balance: milli(c.balance),
        })),
    }));
  return {
    ready_to_assign: milli(monthData.month.to_be_budgeted),
    age_of_money: monthData.month.age_of_money ?? null,
    groups,
  };
}

export async function getMonth(monthInput: string) {
  const api = ynabClient();
  const month = monthInput || "current";
  const { data } = await api.months.getPlanMonth(BUDGET_ID, month);
  const m = data.month;
  return {
    month: m.month,
    income: milli(m.income),
    budgeted: milli(m.budgeted),
    activity: milli(m.activity),
    to_be_budgeted: milli(m.to_be_budgeted),
    age_of_money: m.age_of_money ?? null,
    categories: m.categories
      .filter((c) => !c.deleted && !c.hidden)
      .map((c): Category => ({
        id: c.id,
        name: c.name,
        budgeted: milli(c.budgeted),
        activity: milli(c.activity),
        balance: milli(c.balance),
      })),
  };
}

type ListTxnInput = {
  type?: "uncategorized" | "unapproved";
  since_date?: string;
  account_id?: string;
  category_id?: string;
  limit?: number;
};

export async function listTransactions(input: ListTxnInput): Promise<Transaction[]> {
  const api = ynabClient();
  const limit = input.limit ?? 100;

  let rows: Array<{
    id: string;
    date: string;
    amount: number;
    payee_name?: string | null;
    category_id?: string | null;
    category_name?: string | null;
    account_id: string;
    account_name: string;
    memo?: string | null;
    approved: boolean;
    cleared: string;
  }>;

  if (input.account_id) {
    const { data } = await api.transactions.getTransactionsByAccount(
      BUDGET_ID,
      input.account_id,
      input.since_date,
      input.type,
    );
    rows = data.transactions;
  } else if (input.category_id) {
    const { data } = await api.transactions.getTransactionsByCategory(
      BUDGET_ID,
      input.category_id,
      input.since_date,
      input.type,
    );
    rows = data.transactions;
  } else {
    const { data } = await api.transactions.getTransactions(
      BUDGET_ID,
      input.since_date,
      input.type,
    );
    rows = data.transactions;
  }

  const txns: Transaction[] = rows.map((t) => ({
    id: t.id,
    date: t.date,
    amount: milli(t.amount),
    payee_name: t.payee_name ?? null,
    category_id: t.category_id ?? null,
    category_name: t.category_name ?? null,
    account_id: t.account_id,
    account_name: t.account_name,
    memo: t.memo ?? null,
    approved: t.approved,
    cleared: t.cleared,
  }));

  txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return txns.slice(0, limit);
}

export async function getPayees() {
  const api = ynabClient();
  const { data } = await api.payees.getPayees(BUDGET_ID);
  return data.payees
    .filter((p) => !p.deleted)
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function categorizeTransaction(
  transaction_id: string,
  category_id: string,
) {
  const api = ynabClient();
  const { data } = await api.transactions.updateTransaction(
    BUDGET_ID,
    transaction_id,
    { transaction: { category_id } },
  );
  const t = data.transaction;
  const payee = t.payee_name ?? "Transaction";
  const cat = t.category_name ?? "category";
  return {
    id: t.id,
    category_id: t.category_id,
    summary: {
      kind: "categorize",
      title: "Categorized transaction",
      detail: `${payee} (${formatDollars(milli(t.amount))}) → ${cat}`,
    },
  };
}

export async function bulkCategorizeTransactions(
  updates: Array<{ transaction_id: string; category_id: string }>,
) {
  const api = ynabClient();
  const { data } = await api.transactions.updateTransactions(BUDGET_ID, {
    transactions: updates.map((u) => ({
      id: u.transaction_id,
      category_id: u.category_id,
    })),
  });
  const txns = data.transactions ?? [];
  const byCat = new Map<string, number>();
  for (const t of txns) {
    const name = t.category_name ?? "Uncategorized";
    byCat.set(name, (byCat.get(name) ?? 0) + 1);
  }
  const breakdown = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${n} → ${name}`)
    .join(", ");
  return {
    updated: txns.length,
    duplicate_import_ids: data.duplicate_import_ids ?? [],
    summary: {
      kind: "bulk_categorize",
      title: `Categorized ${txns.length} transaction${txns.length === 1 ? "" : "s"}`,
      detail: breakdown,
    },
  };
}

export async function assignToCategory(
  category_id: string,
  month: string,
  budgeted_dollars: number,
) {
  const api = ynabClient();
  let prior: number | null = null;
  try {
    const { data: before } = await api.categories.getMonthCategoryById(
      BUDGET_ID,
      month,
      category_id,
    );
    prior = milli(before.category.budgeted);
  } catch {
    // best-effort: prior unknown
  }
  const { data } = await api.categories.updateMonthCategory(
    BUDGET_ID,
    month,
    category_id,
    { category: { budgeted: dollarsToMilli(budgeted_dollars) } },
  );
  const next = milli(data.category.budgeted);
  const delta = prior != null ? next - prior : null;
  const detail =
    prior != null
      ? `${data.category.name}: ${formatDollars(prior)} → ${formatDollars(next)}${
          delta != null
            ? ` (${delta >= 0 ? "+" : "−"}${formatDollars(Math.abs(delta))})`
            : ""
        }`
      : `${data.category.name} set to ${formatDollars(next)}`;
  return {
    id: data.category.id,
    name: data.category.name,
    budgeted: next,
    summary: {
      kind: "assign",
      title: "Budget assigned",
      detail,
    },
  };
}

function formatDollars(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
