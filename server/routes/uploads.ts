import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq, like } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "@/db";
import { buildings, claims, financialTransactions, maintenanceTickets, subscriptionPaymentRequests } from "@/db/schema";
import { isStaffSession } from "@/lib/auth";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { objectStorageClient, UPLOAD_BUCKET } from "@/server/lib/object-storage";
import { parseBody, type RequestContext } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const BUCKET = UPLOAD_BUCKET;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Upload folders the app actually uses. `directory` used to be any free-form
 * 40-character string interpolated straight into the object key, so a caller
 * could aim a write at another namespace. The list makes the key space closed.
 */
const ALLOWED_DIRECTORIES = new Set(["buildings", "identity-docs", "leases", "tickets", "invoices", "files", "claims", "receipts", "agency", "billing"]);
/** Folders a tenant-portal identity may upload to. */
const PORTAL_DIRECTORIES = new Set(["tickets", "claims", "files"]);

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/3gpp"];
const STAFF_TYPES = [...IMAGE_TYPES, "application/pdf", "application/octet-stream"];
const PORTAL_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];

function safeKeyFilename(value: string) {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned ? cleaned.slice(0, 100) : `file-${Date.now()}`;
}

function keyFromPath(path: string) {
  const prefix = "/api/uploads/";
  if (!path.startsWith(prefix)) throw new HTTPException(400, { message: "Invalid upload path." });
  return path.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
}

/**
 * An object is readable by the identity that owns its key. Staff keys are
 * namespaced by the application user id, portal keys by the Better Auth id.
 */
function isOwnKey(key: string, ownerId: string) {
  if (key.includes("..") || key.startsWith("/")) return false;
  return key.startsWith(`${ownerId}/`);
}

type Uploader = { id: string; kind: "staff" | "tenant" };

/**
 * Identify who is uploading. Staff go through the application-user bootstrap
 * (owner/manager only); a portal identity is its Better Auth user id, which is
 * what namespaces its objects.
 */
async function resolveUploader(c: RequestContext): Promise<Uploader> {
  const session = c.get("session");
  if (!session?.user) throw new HTTPException(401, { message: "Authentication required." });
  if (isStaffSession(session)) {
    const actor = await requireActor(c);
    requireRole(actor, ["owner", "manager"]);
    return { id: actor.id, kind: "staff" };
  }
  return { id: session.user.id, kind: "tenant" };
}

const presignInput = z.object({
  filename: z.string().min(1).max(160),
  contentType: z.string().min(1).max(120).default("application/octet-stream"),
  directory: z.string().min(1).max(40).default("files"),
});

/** Generate a presigned PUT URL so the browser uploads straight to the bucket. */
router.post("/uploads/presign", async (c) => {
  const uploader = await resolveUploader(c);
  const { filename, contentType, directory: requestedDirectory } = await parseBody(c, presignInput);
  // `directory` has a zod default, but `parseBody` is typed on the schema
  // *input*, so the fallback has to be repeated here.
  const directory = requestedDirectory ?? "files";
  const allowedTypes = uploader.kind === "tenant" ? PORTAL_TYPES : STAFF_TYPES;
  const allowedDirectories = uploader.kind === "tenant" ? PORTAL_DIRECTORIES : ALLOWED_DIRECTORIES;
  if (!allowedTypes.includes(contentType ?? "")) {
    throw new HTTPException(400, { message: "Type de fichier non autorisé." });
  }
  if (!allowedDirectories.has(directory)) {
    throw new HTTPException(400, { message: "Dossier d’upload inconnu." });
  }
  // Namespaced by the uploader so `GET /uploads/*` can tell whose object it is
  // without a database lookup, and so a manager cannot write into the folder of
  // a portfolio they have no access to.
  const key = `${uploader.id}/${directory}/${safeKeyFilename(filename)}-${crypto.randomUUID().slice(0, 8)}`;
  const client = objectStorageClient();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return c.json({ data: { key, url, method: "PUT", contentLength: MAX_FILE_BYTES } });
});

/**
 * A staff member may read a tenant-uploaded file when it is attached to a
 * ticket or claim on one of their buildings — tenants upload under their own
 * namespace, so the reference in the ticket/claim is the authorization.
 */
async function staffCanReadReferencedFile(key: string, organizationId: string): Promise<boolean> {
  const db = getDb();
  const suffix = `%/api/uploads/${key}`;
  const access = eq(buildings.organizationId, organizationId);
  const [ticket] = await db
    .select({ id: maintenanceTickets.id })
    .from(maintenanceTickets)
    .innerJoin(buildings, eq(maintenanceTickets.buildingId, buildings.id))
    .where(and(access, like(maintenanceTickets.photoUrl, suffix)))
    .limit(1);
  if (ticket) return true;
  const [claim] = await db
    .select({ id: claims.id })
    .from(claims)
    .innerJoin(buildings, eq(claims.buildingId, buildings.id))
    .where(and(access, like(claims.photoUrl, suffix)))
    .limit(1);
  if (claim) return true;
  // Accounting receipts attached to a ledger row on a building the actor owns
  // or manages — so a co-manager can open a document they did not upload.
  const [transaction] = await db
    .select({ id: financialTransactions.id })
    .from(financialTransactions)
    .innerJoin(buildings, eq(financialTransactions.buildingId, buildings.id))
    .where(and(access, like(financialTransactions.attachmentUrl, suffix)))
    .limit(1);
  if (transaction) return true;
  // Manual-billing receipts on the actor's agency payment requests.
  const [billing] = await db
    .select({ id: subscriptionPaymentRequests.id })
    .from(subscriptionPaymentRequests)
    .where(and(eq(subscriptionPaymentRequests.agencyId, organizationId), like(subscriptionPaymentRequests.receiptUrl, suffix)))
    .limit(1);
  return Boolean(billing);
}

/**
 * Proxy an object back through the API so all files stay behind the same
 * session cookie. The Bucket stays private: keys are never exposed publicly.
 */
router.get("/uploads/*", async (c) => {
  const uploader = await resolveUploader(c);
  const key = keyFromPath(c.req.path);
  if (!key) throw new HTTPException(400, { message: "Invalid object key." });

  let allowed = isOwnKey(key, uploader.id);
  if (!allowed && uploader.kind === "staff") {
    const actor = await requireActor(c);
    allowed = await staffCanReadReferencedFile(key, actor.organizationId);
  }
  if (!allowed) {
    // `404`, not `403`: a forbidden status would confirm the key exists.
    throw new HTTPException(404, { message: "File not found." });
  }

  const client = objectStorageClient();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  let result: GetObjectCommandOutput;
  try {
    result = await client.send(command);
  } catch {
    throw new HTTPException(404, { message: "File not found." });
  }

  const body = await new Response(result.Body as ReadableStream).arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": result.ContentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

export default router;
