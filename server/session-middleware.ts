import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth } from "@/lib/auth";

export type ApiEnv = {
  Variables: {
    session: typeof auth.$Infer.Session | null;
  };
};

/** Load the Better Auth session for protected Hono routes. */
export const sessionMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  c.set("session", session);
  await next();
});

/** Reject unauthenticated requests before they reach a protected handler. */
export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  if (!c.get("session")) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  await next();
});
