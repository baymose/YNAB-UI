import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { chats } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db()
    .select({
      id: chats.id,
      title: chats.title,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .orderBy(desc(chats.updatedAt));
  return Response.json(rows);
}

export async function POST() {
  const [row] = await db()
    .insert(chats)
    .values({})
    .returning({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt });
  return Response.json(row);
}
