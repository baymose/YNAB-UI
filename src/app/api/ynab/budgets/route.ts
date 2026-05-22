export const runtime = "nodejs";

export async function GET() {
  const token = process.env.YNAB_TOKEN;
  if (!token) {
    return Response.json({ error: "YNAB_TOKEN not set" }, { status: 500 });
  }
  const res = await fetch("https://api.ynab.com/v1/budgets", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    return Response.json(body, { status: res.status });
  }
  return Response.json(
    body.data.budgets.map((b: { id: string; name: string }) => ({
      id: b.id,
      name: b.name,
    })),
  );
}
