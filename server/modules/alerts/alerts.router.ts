import { z } from "zod";
import { router, analystProc } from "../../_core/trpc";
import { createAuditFromContext } from "../../_core/audit";
import {
  listAlerts,
  getAlertOrThrow,
  assignAlert,
  resolveAlert,
  getAlertStats,
} from "./alerts.service";

const alertStatusEnum = z.enum(["OPEN", "IN_REVIEW", "ESCALATED", "CLOSED", "FALSE_POSITIVE"]);
const alertPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const alertTypeEnum = z.enum(["THRESHOLD", "PATTERN", "VELOCITY", "SANCTIONS", "PEP", "FRAUD", "NETWORK"]);

export const alertsRouter = router({

  list: analystProc
    .input(z.object({
      page:       z.number().int().positive().default(1),
      limit:      z.number().int().min(1).max(100).default(20),
      status:     alertStatusEnum.optional(),
      priority:   alertPriorityEnum.optional(),
      alertType:  alertTypeEnum.optional(),
      customerId: z.number().int().positive().optional(),
      assignedTo: z.number().int().positive().optional(),
    }))
    .query(async ({ input }) => listAlerts(input)),

  getById: analystProc
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => getAlertOrThrow(input.id)),

  assign: analystProc
    .input(z.object({
      id:     z.number().int().positive(),
      userId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const alert = await assignAlert(input.id, input.userId);
      await log({
        action: "ALERT_ASSIGNED",
        entityType: "alert",
        entityId: alert.alertId,
        details: { assignedTo: input.userId },
      });
      return alert;
    }),

  resolve: analystProc
    .input(z.object({
      id:         z.number().int().positive(),
      resolution: z.enum(["CLOSED", "FALSE_POSITIVE", "ESCALATED"]),
      note:       z.string().min(10, "Note de résolution requise (min 10 caractères)"),
    }))
    .mutation(async ({ input, ctx }) => {
      const log = createAuditFromContext(ctx);
      const alert = await resolveAlert(input.id, input.resolution, ctx.user.id, input.note);
      await log({
        action: input.resolution === "FALSE_POSITIVE" ? "ALERT_FALSE_POSITIVE"
               : input.resolution === "ESCALATED"     ? "ALERT_ESCALATED"
               : "ALERT_CLOSED",
        entityType: "alert",
        entityId: alert.alertId,
        details: { resolution: input.resolution, note: input.note },
      });
      return alert;
    }),

  stats: analystProc
    .query(async () => getAlertStats()),
});
