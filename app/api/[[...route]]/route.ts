import { api } from "@/server/app";

export const runtime = "nodejs";

/**
 * Next.js is the deployment/runtime host; Hono is the single API router.
 * Keeping this adapter intentionally thin prevents a second auth/API surface.
 */
const handler = (request: Request) => api.fetch(request);

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
