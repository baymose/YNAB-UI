export function fmt(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function Money({ amount }: { amount: number }) {
  const cls =
    amount > 0 ? "text-green" : amount < 0 ? "text-red" : "text-muted";
  return <span className={cls}>{fmt(amount)}</span>;
}
