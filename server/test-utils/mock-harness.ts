import { HTTPException } from "hono/http-exception";
import {
  subscriptionPaymentRequests,
  subscriptionPlans,
  subscriptions,
  users,
} from "@/db/schema";

/**
 * Shared mock harness for route/guard tests.
 *
 * `bun test` runs all files in one process with a single module registry, so
 * `mock.module("@/db")` (or auth-context) in one file shadows every other
 * file. Every test file must therefore register the *same* factories from
 * here and steer behavior through the shared `harness` singleton (reset in
 * each file's `beforeEach`). Divergent per-file mocks break the whole suite.
 */

export const harness = {
  actor: null as any,
  adminMode: "admin" as "admin" | "denied",
  adminUser: { id: "auth-admin-1", email: "admin@naya.app", role: "admin" },
  plans: [] as any[],
  subs: [] as any[],
  requests: [] as any[],
  users: [{ id: "user-1" }] as any[],
  /** Agency scoping simulation for request reads (mirrors the WHERE predicate). */
  agencyFilter: true,
  /** FIFO exact results for bespoke selects (slug checks, counts, …). */
  selectQueue: [] as any[][],
  // Admin-confirm sequencing (the route updates the request table twice:
  // atomic claim first, final state second).
  claimRows: [] as any[],
  existingRows: [] as any[],
  confirmSubRows: [] as any[],
  updatedSubRows: [] as any[],
  updatedReqRows: [] as any[],
  requestUpdateCalls: 0,
  subUpdateCalls: 0,
  updateReturning: [] as any[],
  insertReturning: [] as any[],
  recordedUpdates: [] as any[],
  recordedInserts: [] as any[],
  recordedEvents: [] as any[],
  whereArgs: [] as any[][],
};

export function resetHarness() {
  harness.actor = null;
  harness.adminMode = "admin";
  harness.plans = [];
  harness.subs = [];
  harness.requests = [];
  harness.users = [{ id: "user-1" }];
  harness.agencyFilter = true;
  harness.selectQueue = [];
  harness.claimRows = [];
  harness.existingRows = [];
  harness.confirmSubRows = [];
  harness.updatedSubRows = [];
  harness.updatedReqRows = [];
  harness.requestUpdateCalls = 0;
  harness.subUpdateCalls = 0;
  harness.updateReturning = [];
  harness.insertReturning = [];
  harness.recordedUpdates = [];
  harness.recordedInserts = [];
  harness.recordedEvents = [];
  harness.whereArgs = [];
}

function tableName(table: unknown) {
  if (table === subscriptionPlans) return "subscription_plans";
  if (table === subscriptions) return "subscriptions";
  if (table === subscriptionPaymentRequests) return "subscription_payment_requests";
  if (table === users) return "users";
  return "other";
}

function rowsFor(table: unknown): any[] {  if (harness.selectQueue.length) return harness.selectQueue.shift()!;
  if (table === subscriptionPlans) return harness.plans;
  if (table === subscriptions) return harness.subs;
  if (table === subscriptionPaymentRequests) {
    if (!harness.agencyFilter) return harness.requests;
    const org = harness.actor?.organizationId;
    return harness.requests.filter((r) => !r.agencyId || r.agencyId === org);
  }
  if (table === users) return harness.users;
  return [];
}

function chain(rows: any[]): any {
  const pending: any = Promise.resolve(rows);
  pending.where = (...args: any[]) => {
    harness.whereArgs.push(args);
    return chain(rows);
  };
  pending.from = (table: any) => chain(rowsFor(table));
  pending.leftJoin = (...args: any[]) => {
    harness.whereArgs.push(args);
    return chain(rows);
  };
  pending.orderBy = (..._args: any[]) => chain(rows);
  pending.limit = async (_n?: number) => rows;
  pending.offset = (..._args: any[]) => chain(rows);
  return pending;
}

const tx = {
  update: (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: (...args: any[]) => {
        harness.whereArgs.push(args);
        return {
          returning: async () => {
            if (table === subscriptionPaymentRequests) {
              harness.requestUpdateCalls += 1;
              return harness.requestUpdateCalls === 1 ? harness.claimRows : harness.updatedReqRows;
            }
            harness.subUpdateCalls += 1;
            return harness.updatedSubRows;
          },
        };
      },
    }),
  }),
  select: () => ({
    from: (table: unknown) => ({
      where: (...args: any[]) => {
        harness.whereArgs.push(args);
        return {
          limit: async () => {
            if (table === subscriptionPaymentRequests) return harness.existingRows;
            if (table === subscriptions) return harness.confirmSubRows;
            return [];
          },
        };
      },
    }),
  }),
  insert: (_table: unknown) => ({
    values: (values: unknown) => {
      harness.recordedEvents.push(values);
      return Promise.resolve([]);
    },
  }),
};

const db = {
  select: (..._args: any[]) => ({ from: (table: any) => chain(rowsFor(table)) }),
  update: (table: any) => ({
    set: (values: Record<string, unknown>) => ({
      where: (...args: any[]) => {
        harness.whereArgs.push(args);
        harness.recordedUpdates.push({ table: tableName(table), values });
        return { returning: async () => harness.updateReturning };
      },
    }),
  }),
  insert: (_table: any) => {
    const done: any = Promise.resolve([]);
    done.returning = async () => harness.insertReturning;
    return {
      values: (values: unknown) => {
        harness.recordedInserts.push(values);
        return done;
      },
    };
  },
  transaction: async (cb: (t: unknown) => unknown) => cb(tx),
};

export function mockDb() {
  return { getDb: () => db };
}

export function mockAuthContext() {
  return {
    requireActor: async () => {
      if (!harness.actor) throw new HTTPException(401, { message: "Authentication required." });
      return harness.actor;
    },
    requireRole: (actor: { role: string }, roles: string[]) => {
      if (!roles.includes(actor.role)) {
        throw new HTTPException(403, { message: "Vous n’avez pas les droits nécessaires pour cette action." });
      }
    },
    buildingAccessCondition: (..._args: any[]) => ({}),
    getBuildingForActor: async () => {
      throw new HTTPException(404, { message: "Building not found." });
    },
  };
}

export function mockPlatformAdmin() {
  return {
    requirePlatformAdmin: async () => {
      if (harness.adminMode !== "admin") {
        throw new HTTPException(403, { message: "Accès réservé à l'administrateur de la plateforme." });
      }
      return harness.adminUser;
    },
  };
}

export function seenJson(value: unknown) {
  const seen = new Set();
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === "object" && nested !== null) {
        if (seen.has(nested)) return "[circ]";
        seen.add(nested);
      }
      return typeof nested === "function" ? "[fn]" : nested;
    });
  } catch {
    return "";
  }
}

/** True when a recorded predicate scopes on the given agency id. */
export function scopedToAgency(agencyId: string) {
  return harness.whereArgs.some((args) => seenJson(args).includes(agencyId));
}
