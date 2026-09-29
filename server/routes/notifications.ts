import { Hono } from "hono";
import { z } from "zod";
import { rentReminderMessage, sendSmsMessage, sendWhatsAppMessage } from "@/lib/notifications";
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

router.post("/notifications/rent-reminder", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const data = await parseBody(c, input);
  const message = rentReminderMessage(data);
  const result = data.channel === "whatsapp"
    ? await sendWhatsAppMessage({ to: data.phone, message })
    : await sendSmsMessage({ to: data.phone, message });
  return c.json({ data: result });
});

export default router;
