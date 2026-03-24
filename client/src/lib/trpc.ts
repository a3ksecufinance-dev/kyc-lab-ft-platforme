import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient(getToken: () => string | null) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/trpc",
        transformer: superjson,
        headers() {
          const token = getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
