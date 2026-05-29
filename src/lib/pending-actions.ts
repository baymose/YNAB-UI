import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type PendingAction = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  userId: string;
  chatId: string;
  expiresAt: string;
};

export type PendingActionCard = {
  id: string;
  token: string;
  toolName: string;
  input: Record<string, unknown>;
  title: string;
  detail: string;
  destructive: boolean;
  expiresAt: string;
};

type CreatePendingActionArgs = {
  toolName: string;
  input: Record<string, unknown>;
  userId: string;
  chatId: string;
  now?: number;
  secret?: string;
};

type VerifyPendingActionArgs = {
  userId: string;
  chatId: string;
  now?: number;
  secret?: string;
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export function createPendingAction({
  toolName,
  input,
  userId,
  chatId,
  now = Date.now(),
  secret = pendingActionSecret(),
}: CreatePendingActionArgs): PendingActionCard {
  const action: PendingAction = {
    id: `pa_${randomBytes(12).toString("hex")}`,
    toolName,
    input,
    userId,
    chatId,
    expiresAt: new Date(now + FIFTEEN_MINUTES_MS).toISOString(),
  };
  const payload = encode(action);
  const signature = sign(payload, secret);
  const description = describePendingAction(toolName, input);

  return {
    ...action,
    token: `${payload}.${signature}`,
    ...description,
  };
}

export function verifyPendingAction(
  token: string,
  { userId, chatId, now = Date.now(), secret = pendingActionSecret() }: VerifyPendingActionArgs,
): PendingAction {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Invalid pending action token");

  const expected = sign(payload, secret);
  if (!safeEqual(signature, expected)) {
    throw new Error("Invalid pending action signature");
  }

  const action = decode(payload) as PendingAction;
  if (action.userId !== userId || action.chatId !== chatId) {
    throw new Error("Pending action does not belong to this chat");
  }
  if (isPendingActionExpired(action.expiresAt, now)) {
    throw new Error("Pending action has expired");
  }

  return action;
}

export function describePendingAction(
  toolName: string,
  input: Record<string, unknown>,
): { title: string; detail: string; destructive: boolean } {
  switch (toolName) {
    case "categorize_transaction":
      return {
        title: "Confirm transaction category change",
        detail: `Move transaction ${stringValue(input.transaction_id)} to category ${stringValue(input.category_id)}.`,
        destructive: false,
      };
    case "bulk_categorize_transactions": {
      const updates = Array.isArray(input.updates) ? input.updates : [];
      return {
        title: `Confirm ${updates.length} transaction category updates`,
        detail: `Update ${updates.length} transactions to new categories.`,
        destructive: false,
      };
    }
    case "assign_to_category":
      return {
        title: "Confirm budget assignment",
        detail: `Set category ${stringValue(input.category_id)} to ${formatDollars(input.budgeted_dollars)} for ${stringValue(input.month)}.`,
        destructive: false,
      };
    case "save_memory":
      return {
        title: "Confirm saved memory",
        detail: `Remember: ${stringValue(input.content)}`,
        destructive: false,
      };
    case "delete_memory":
      return {
        title: "Confirm memory deletion",
        detail: `Forget memory ${stringValue(input.id)}.`,
        destructive: true,
      };
    default:
      return {
        title: `Confirm ${toolName}`,
        detail: "Review and approve this change before Penny applies it.",
        destructive: false,
      };
  }
}

export function isPendingActionExpired(expiresAt: string, now = Date.now()) {
  return Date.parse(expiresAt) < now;
}

export function pendingActionSecret() {
  const secret =
    process.env.PENDING_ACTION_SECRET ??
    process.env.BETTER_AUTH_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Missing PENDING_ACTION_SECRET or BETTER_AUTH_SECRET");
  return secret;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function stringValue(value: unknown) {
  return String(value ?? "unknown");
}

function formatDollars(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value ?? "unknown");
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
