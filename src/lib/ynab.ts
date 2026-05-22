import * as ynab from "ynab";

let _client: ynab.API | null = null;

export function ynabClient(): ynab.API {
  if (_client) return _client;
  const token = process.env.YNAB_TOKEN;
  if (!token) {
    throw new Error(
      "YNAB_TOKEN is not set. Add it to .env.local (see .env.local.example).",
    );
  }
  _client = new ynab.API(token);
  return _client;
}

export const BUDGET_ID = process.env.YNAB_BUDGET_ID || "default";
