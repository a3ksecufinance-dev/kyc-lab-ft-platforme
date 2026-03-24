import { TRPCError } from "@trpc/server";
import {
  findManyAlerts,
  findAlertById,
  updateAlert,
  getAlertStats,
  type ListAlertsInput,
} from "./alerts.repository";
import type { Alert } from "../../../drizzle/schema";

export async function listAlerts(input: ListAlertsInput) {
  return findManyAlerts(input);
}

export async function getAlertOrThrow(id: number): Promise<Alert> {
  const alert = await findAlertById(id);
  if (!alert) throw new TRPCError({ code: "NOT_FOUND", message: `Alerte #${id} introuvable` });
  return alert;
}

export async function assignAlert(id: number, userId: number): Promise<Alert> {
  await getAlertOrThrow(id);
  return updateAlert(id, { assignedTo: userId, status: "IN_REVIEW" });
}

export async function resolveAlert(
  id: number,
  resolution: "CLOSED" | "FALSE_POSITIVE" | "ESCALATED",
  resolvedBy: number,
  resolutionNote: string
): Promise<Alert> {
  const alert = await getAlertOrThrow(id);

  if (alert.status === "CLOSED" || alert.status === "FALSE_POSITIVE") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Alerte déjà ${alert.status} — ne peut plus être modifiée`,
    });
  }

  return updateAlert(id, {
    status: resolution,
    resolvedBy,
    resolvedAt: new Date(),
    resolution: resolutionNote,
  });
}

export { getAlertStats };
