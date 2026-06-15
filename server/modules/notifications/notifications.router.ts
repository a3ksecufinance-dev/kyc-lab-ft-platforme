/**
 * tRPC Router — Notifications in-app (Phase D)
 *
 * Endpoints :
 *   list         — liste des notifications (paginée, filtre non-lues)
 *   unreadCount  — compteur badge sidebar
 *   markRead     — marquer une notification comme lue
 *   markAllRead  — tout marquer comme lu
 *   cleanup      — nettoyage admin des anciennes notifications
 */

import { z } from "zod";
import { router, protectedProc, adminProc } from "../../_core/trpc";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  cleanupOldNotifications,
} from "./notifications.service";

export const notificationsRouter = router({

  list: protectedProc
    .input(z.object({
      limit:      z.number().int().min(1).max(100).default(50),
      offset:     z.number().int().min(0).default(0),
      unreadOnly: z.boolean().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      return getUserNotifications(ctx.user.id, {
        limit:      input?.limit ?? 50,
        offset:     input?.offset ?? 0,
        unreadOnly: input?.unreadOnly ?? false,
      });
    }),

  unreadCount: protectedProc
    .query(async ({ ctx }) => {
      const count = await getUnreadCount(ctx.user.id);
      return { count };
    }),

  markRead: protectedProc
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const success = await markAsRead(input.id, ctx.user.id);
      return { success };
    }),

  markAllRead: protectedProc
    .mutation(async ({ ctx }) => {
      const marked = await markAllAsRead(ctx.user.id);
      return { marked };
    }),

  cleanup: adminProc
    .mutation(async () => {
      return cleanupOldNotifications();
    }),
});
