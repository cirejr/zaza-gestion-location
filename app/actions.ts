"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { api } from "@/server/app";

const paymentInputSchema = z.object({
  leaseId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "wave", "orange_money", "mtn_momo", "bank_transfer"]),
  transactionRef: z.string().max(180).optional(),
  paidAt: z.coerce.date().optional(),
});

const utilityInputSchema = z.object({
  buildingId: z.string().uuid(),
  type: z.enum(["water", "electricity", "security", "other"]),
  supplier: z.string().max(160).optional(),
  totalAmount: z.number().int().positive(),
  period: z.string().min(1).max(32),
});

const reminderInputSchema = z.object({
  channel: z.enum(["whatsapp", "sms"]),
  phone: z.string().min(8),
  tenantName: z.string().min(1),
  buildingName: z.string().min(1),
  unitNumber: z.string().min(1),
  amount: z.number().positive(),
  dueDate: z.string().min(1),
  paymentUrl: z.string().url().optional(),
});

async function backendRequest<T>(path: string, init: RequestInit = {}) {
  const baseUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const requestHeaders = new Headers(init.headers);
  if (init.body && !requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
  const cookie = (await headers()).get("cookie");
  if (cookie) requestHeaders.set("cookie", cookie);

  const response = await api.fetch(new Request(new URL(path, baseUrl), { ...init, headers: requestHeaders }));
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const message = isJson && body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : `Backend request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export async function recordPayment(input: z.input<typeof paymentInputSchema>) {
  const data = paymentInputSchema.parse(input);
  return backendRequest<{ data: unknown }>("/api/payments", { method: "POST", body: JSON.stringify(data) });
}

export async function createCommonUtility(input: z.input<typeof utilityInputSchema>) {
  const data = utilityInputSchema.parse(input);
  return backendRequest<{ data: unknown }>(`/api/buildings/${data.buildingId}/utilities`, { method: "POST", body: JSON.stringify(data) });
}

export async function sendRentReminder(input: z.input<typeof reminderInputSchema>) {
  const data = reminderInputSchema.parse(input);
  return backendRequest<{ data: unknown }>("/api/notifications/rent-reminder", { method: "POST", body: JSON.stringify(data) });
}
