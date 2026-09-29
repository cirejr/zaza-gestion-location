import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { requireActor, requireRole } from "@/server/lib/auth-context";
import { parseBody } from "@/server/lib/http";
import type { ApiEnv } from "@/server/session-middleware";

const router = new Hono<ApiEnv>();

const BUCKET = "uploads";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function objectStorageClient() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(503, { message: "Object storage is not configured." });
  }
  return new S3Client({
    region: process.env.AWS_REGION ?? "us-east-2",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function safeKeyFilename(value: string) {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned ? cleaned.slice(0, 100) : `file-${Date.now()}`;
}

function keyFromPath(path: string) {
  const prefix = "/api/uploads/";
  if (!path.startsWith(prefix)) throw new HTTPException(400, { message: "Invalid upload path." });
  return path.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
}

const presignInput = z.object({
  filename: z.string().min(1).max(160),
  contentType: z.string().min(1).max(120).default("application/octet-stream"),
  directory: z.string().min(1).max(40).default("files"),
});

/** Generate a presigned PUT URL so the browser uploads straight to the bucket. */
router.post("/uploads/presign", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const { filename, contentType, directory } = await parseBody(c, presignInput);
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf", "application/octet-stream"].includes(contentType ?? "")) {
    throw new HTTPException(400, { message: "Type de fichier non autorisé." });
  }
  const key = `${directory}/${safeKeyFilename(filename)}-${crypto.randomUUID().slice(0, 8)}`;
  const client = objectStorageClient();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return c.json({ data: { key, url, method: "PUT", contentLength: MAX_FILE_BYTES } });
});

/**
 * Proxy an object back through the API so all files stay behind the same
 * session cookie. The Bucket stays private: keys are never exposed publicly.
 */
router.get("/uploads/*", async (c) => {
  const actor = await requireActor(c);
  requireRole(actor, ["owner", "manager"]);
  const key = keyFromPath(c.req.path);
  if (!key) throw new HTTPException(400, { message: "Invalid object key." });

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