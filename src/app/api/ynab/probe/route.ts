export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = process.env.YNAB_TOKEN;
  if (!token) return Response.json({ error: "no token" }, { status: 500 });
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "/user";
  const base = url.searchParams.get("base") || "https://api.ynab.com/v1";
  const scheme = url.searchParams.get("auth") || "Bearer";
  const accept = url.searchParams.get("accept") || "application/json";
  const headers: Record<string, string> = { Accept: accept };
  if (scheme !== "none") headers.Authorization = `${scheme} ${token}`;
  const res = await fetch(`${base}${path}`, { headers });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "text/plain",
      "x-ynab-status": String(res.status),
    },
  });
}
