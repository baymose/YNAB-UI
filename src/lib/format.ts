export const milliToDollars = (milli: number | null | undefined): number =>
  milli == null ? 0 : milli / 1000;

export const dollarsToMilli = (dollars: number): number =>
  Math.round(dollars * 1000);

export const formatMoney = (milli: number | null | undefined): string => {
  const dollars = milliToDollars(milli);
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
};

export const currentMonthIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
