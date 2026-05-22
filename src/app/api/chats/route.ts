import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats } from "@/db/schema";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (r) {
    return r as Response;
  }
  const rows = await db()
    .select({
      id: chats.id,
      title: chats.title,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt));
  return Response.json(rows);
}

export async function POST() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (r) {
    return r as Response;
  }
  const [row] = await db()
    .insert(chats)
    .values({ userId })
    .returning({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt });
  return Response.json(row);
}
