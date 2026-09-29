import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { isPreviewResult, rentReminderMessage, sendRentReminder, sendSmsMessage, type NotificationResult } from "@/lib/notifications";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { countValue, pagination, parseBody, parseUuid } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();
const input = z.object({
  channel: z.enum(["whatsapp", "sms"]),
  phone: z.string().min(8).max(32),
  tenantName: z.string().min(1).max(160),
  buildingName: z.string().min(1).max(160),
  unitNumber: z.string().min(1).max(32),
  amount: z.number().positive(),
  dueDate: z.string().min(1).max(80),
  paymentUrl: z.string().url().optional(),
});

/**
 * Rent reminder. The WhatsApp channel always sends the approved `relance_loyer`
 * template (Meta no longer allows free text for business-initiated messages);
 * the `sms` channel uses a free-text fallback when enabled.
 */
router.post("/notifications/rent-reminder", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, input);
  const requested = data.channel;
  let result =
    requested === "whatsapp"
      ? await sendRentReminder({
          to: data.phone,
          tenantName: data.tenantName,
          buildingName: data.buildingName,
          unitNumber: data.unitNumber,
          amount: data.amount,
          dueDate: data.dueDate,
        })
      : await sendSmsMessage({ to: data.phone, message: rentReminderMessage(data) });

  // A preview means Meta is not configured, which is not the same as a send that
  // failed. Falling back there keeps the reminder useful while the Cloud API is
  // still being set up; a genuine WhatsApp failure is reported as-is rather than
  // silently re-sent over a channel the manager did not pick.
  let fallback: NotificationResult | null = null;
  if (requested === "whatsapp" && isPreviewResult(result)) {
    const sms = await sendSmsMessage({ to: data.phone, message: rentReminderMessage(data) });
    if (sms.delivered) {
      fallback = sms;
      result = sms;
    }
  }
  return c.json({ data: { ...result, requestedChannel: requested, fallback } });
});

/**
 * In-app inbox. Notifications are written by domain events (see
 * `server/lib/notify.ts`) and read from the header bell. Only the current
 * user's own notifications are ever returned or mutated.
 */
router.get("/notifications", async (c) => {
  const actor = await requireActor(c);
  const { page, limit, offset } = pagination(c, 20);
  const db = getDb();
  const [data, countRows, unreadRows] = await Promise.all([
    db.select().from(notifications)
      .where(eq(notifications.userId, actor.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(notifications).where(eq(notifications.userId, actor.id)),
    db.select({ total: count() }).from(notifications).where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt))),
  ]);
  return c.json({ data, pagination: { page, limit, total: countValue(countRows) }, unread: countValue(unreadRows) });
});

router.post("/notifications/read-all", async (c) => {
  const actor = await requireActor(c);
  await getDb().update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return c.json({ data: { ok: true } });
});

router.post("/notifications/:id/read", async (c) => {
  const actor = await requireActor(c);
  const id = parseUuid(c.req.param("id"), "notification id");
  const [updated] = await getDb().update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, actor.id)))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Notification not found." });
  return c.json({ data: updated });
});

export default router;
