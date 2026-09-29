import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { z } from "zod";
import type { ApiEnv } from "@/server/session-middleware";

export type RequestContext = Context<ApiEnv>;

export async function parseBody<T>(c: RequestContext, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Request body must be valid JSON." });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Validation failed.",
      cause: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

export function parseUuid(value: string, field = "id") {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new HTTPException(400, { message: `Invalid ${field}.` });
  return parsed.data;
}

export function pagination(c: RequestContext, defaultLimit = 25) {
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? defaultLimit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function countValue(rows: Array<{ total: number | string | null }> | undefined) {
  return Number(rows?.[0]?.total ?? 0);
}

export function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvResponse(filename: string, rows: string[][]) {
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
