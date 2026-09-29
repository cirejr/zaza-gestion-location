import { cookies } from "next/headers";
import { api } from "@/server/app";

export class ServerApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ServerApiError";
    this.status = status;
    this.details = details;
  }
}

/** Calls the same Hono application in-process so server pages never bypass the API. */
export async function serverApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const headers = new Headers(init.headers);
  const cookie = cookieStore.toString();
  if (cookie) headers.set("cookie", cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const response = await api.fetch(new Request(new URL(path, baseUrl), { ...init, headers }));
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const message = isJson && body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : `API request failed (${response.status}).`;
    throw new ServerApiError(message, response.status, body);
  }
  return body as T;
}
