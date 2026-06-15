/**
 * Service Notifications in-app — Phase D
 *
 * Gestion des notifications utilisateur : création, lecture, marquage lu,
 * compteur non-lus, et suppression automatique des anciennes notifications.
 */

import { and, eq, desc, count, lte } from "drizzle-orm";
import { db } from "../../_core/db";
import { notifications, users } from "../../../drizzle/schema";
import type { InsertNotification } from "../../../drizzle/schema";
import { createLogger } from "../../_core/logger";

const log = createLogger("notifications");

// ─── Création ────────────────────────────────────────────────────────────────

export async function createNotification(
  data: Omit<InsertNotification, "id" | "createdAt" | "isRead" | "readAt">,
): Promise<{ id: number }> {
  const [row] = await db.insert(notifications).values({
    userId:     data.userId,
    type:       data.type,
    title:      data.title,
    message:    data.message ?? null,
    entityType: data.entityType ?? null,
    entityId:   data.entityId ?? null,
  }).returning({ id: notifications.id });

  log.debug({ userId: data.userId, type: data.type }, "Notification créée");
  return row!;
}

/**
 * Envoie une notification à tous les utilisateurs ayant un rôle donné.
 */
export async function notifyByRole(
  role: string,
  data: Omit<InsertNotification, "id" | "createdAt" | "isRead" | "readAt" | "userId">,
): Promise<number> {
  const targetUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, role as never), eq(users.isActive, true)));

  let sent = 0;
  for (const u of targetUsers) {
    await createNotification({ ...data, userId: u.id });
    sent++;
  }
  return sent;
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

export async function getUserNotifications(
  userId: number,
  opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
) {
  const { limit = 50, offset = 0, unreadOnly = false } = opts;

  const conditions = [eq(notifications.userId, userId)];
  if (unreadOnly) conditions.push(eq(notifications.isRead, false));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function getUnreadCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(row?.total ?? 0);
}

// ─── Marquage lu ─────────────────────────────────────────────────────────────

export async function markAsRead(notificationId: number, userId: number): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

  return (result.rowCount ?? 0) > 0;
}

export async function markAllAsRead(userId: number): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

  return result.rowCount ?? 0;
}

// ─── Nettoyage ───────────────────────────────────────────────────────────────

/**
 * Supprime les notifications lues de plus de 30 jours
 * et les non-lues de plus de 90 jours.
 */
export async function cleanupOldNotifications(): Promise<{ deleted: number }> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

  const r1 = await db
    .delete(notifications)
    .where(and(eq(notifications.isRead, true), lte(notifications.createdAt, thirtyDaysAgo)));

  const r2 = await db
    .delete(notifications)
    .where(lte(notifications.createdAt, ninetyDaysAgo));

  const deleted = (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
  if (deleted > 0) log.info({ deleted }, "Notifications anciennes nettoyées");
  return { deleted };
}
