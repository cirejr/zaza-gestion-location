import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { splitCommonCharge } from "@/lib/utility-split";
import { requireSession, sessionMiddleware, type ApiEnv } from "@/server/session-middleware";
import apartmentsRoutes from "@/server/routes/apartments";
import buildingsRoutes from "@/server/routes/buildings";
import leasesRoutes from "@/server/routes/leases";
import notificationsRoutes from "@/server/routes/notifications";
import paymentsRoutes from "@/server/routes/payments";
import portalRoutes from "@/server/routes/portal";
import reportsRoutes from "@/server/routes/reports";
import tenantsRoutes from "@/server/routes/tenants";
import ticketsRoutes from "@/server/routes/tickets";
import uploadsRoutes from "@/server/routes/uploads";
import utilitiesRoutes from "@/server/routes/utilities";
import usersRoutes from "@/server/routes/users";

const app = new Hono<ApiEnv>().basePath("/api");

app.use("*", cors({ origin: process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000", credentials: true }));

app.get("/health", (c) => c.json({ ok: true, service: "naya-api" }));

// Better Auth is exposed by the same Hono application as the rest of the API.
// The request URL is preserved so Better Auth can resolve /api/auth/* correctly.
app.all("/auth/*", (c) => auth.handler(c.req.raw));

app.get("/me", sessionMiddleware, (c) => c.json({ session: c.get("session") }));

for (const path of ["/buildings", "/apartments", "/tenants", "/leases", "/payments", "/utilities", "/tickets", "/reports", "/notifications", "/users", "/uploads", "/portal"]) {
  app.use(path, sessionMiddleware, requireSession);
  app.use(`${path}/*`, sessionMiddleware, requireSession);
}

const splitSchema = z.object({
  totalAmount: z.number().int().positive(),
  apartmentIds: z.array(z.string().uuid()).min(1),
});

app.post("/utilities/split-preview", async (c) => {
  const payload = splitSchema.safeParse(await c.req.json());
  if (!payload.success) return c.json({ error: "Invalid split payload" }, 400);
  const allocations = splitCommonCharge(payload.data.totalAmount, payload.data.apartmentIds);
  return c.json({ allocations, total: allocations.reduce((sum, item) => sum + item.amount, 0) });
});

app.route("/", buildingsRoutes);
app.route("/", apartmentsRoutes);
app.route("/", tenantsRoutes);
app.route("/", leasesRoutes);
app.route("/", paymentsRoutes);
app.route("/", portalRoutes);
app.route("/", utilitiesRoutes);
app.route("/", ticketsRoutes);
app.route("/", notificationsRoutes);
app.route("/", reportsRoutes);
app.route("/", uploadsRoutes);
app.route("/", usersRoutes);

export { app as api };
export default app;
