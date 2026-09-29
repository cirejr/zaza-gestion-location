import { getDb } from "@/db";
import { notifications } from "@/db/schema";

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
 * Notify the owner and manager in charge of a building. `exclude` drops the
 * acting user so people are not notified about their own actions.
 */
export async function notifyBuildingTeam(
  building: { ownerId: string; managerId: string | null },
  input: NotificationInput & { exclude?: string },
): Promise<void> {
  const recipients = new Set([building.ownerId, building.managerId].filter((id): id is string => Boolean(id)));
  if (input.exclude) recipients.delete(input.exclude);
  const { exclude: _exclude, ...payload } = input;
  await Promise.all([...recipients].map((userId) => notify(userId, payload)));
}
