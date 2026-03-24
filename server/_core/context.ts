import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import { verifyAccessToken } from "../modules/auth/auth.service";
import { createLogger } from "./logger";

const log = createLogger("context");

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};

export async function createContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  let user: User | null = null;

  // Extraire le JWT depuis le header Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      user = await verifyAccessToken(token);
    } catch (err) {
      // Token invalide ou expiré → user reste null
      log.debug({ err }, "Token invalide ou expiré");
    }
  }

  return { req, res, user };
}
