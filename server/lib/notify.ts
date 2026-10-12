import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications, users } from "@/db/schema";

export type NotificationInput = {
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
};

/**
 * Best-effort inbox write for domain events. A failed insert must never break
 * the business action that triggered it (the reminder/WhatsApp path is the
 * source of truth for outbound messaging), so errors are logged and swallowed.
 */
export async function notify(userId: string, input: NotificationInput): Promise<void> {
  try {
    await getDb().insert(notifications).values({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    });
  } catch (error) {
    console.error("notification insert failed", error);
  }
}

/**
 * Notify the staff of the agency that owns a building. The earlier version
 * targeted only the designated owner and manager, which silently dropped
 * colleagues who had been added to the agency since. `exclude` drops the acting
 * user so people are not notified about their own actions.
 */
export async function notifyBuildingTeam(
  building: { organizationId: string | null; ownerId: string },
  input: NotificationInput & { exclude?: string },
): Promise<void> {
  const recipients = building.organizationId
    ? (await getDb().select({ id: users.id }).from(users).where(eq(users.organizationId, building.organizationId))).map(
        (member) => member.id,
      )
    : [building.ownerId];
  const unique = new Set(recipients);
  if (input.exclude) unique.delete(input.exclude);
  const { exclude: _exclude, ...payload } = input;
  await Promise.all([...unique].map((userId) => notify(userId, payload)));
}
