import { Hono } from "hono";
import { z } from "zod";
import { rentReminderMessage, sendRentReminder, sendSmsMessage } from "@/lib/notifications";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { parseBody } from "@/server/lib/http";
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
  const result = data.channel === "whatsapp"
    ? await sendRentReminder({
        to: data.phone,
        tenantName: data.tenantName,
        buildingName: data.buildingName,
        unitNumber: data.unitNumber,
        amount: data.amount,
        dueDate: data.dueDate,
      })
    : await sendSmsMessage({ to: data.phone, message: rentReminderMessage(data) });
  return c.json({ data: result });
});

export default router;