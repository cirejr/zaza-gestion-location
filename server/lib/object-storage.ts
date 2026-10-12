import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { HTTPException } from "hono/http-exception";

export const UPLOAD_BUCKET = "uploads";

/**
 * The S3-compatible client for the private uploads bucket. Kept here rather than
 * in the uploads route so other server code (e.g. embedding an agency logo into
 * a generated PDF) reads objects through the same configured client.
 */
export function objectStorageClient() {
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

/** Read one private object, or `null` when it is missing or storage is down. */
export async function getObjectBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  try {
    const client = objectStorageClient();
    const result = await client.send(new GetObjectCommand({ Bucket: UPLOAD_BUCKET, Key: key }));
    const body = await new Response(result.Body as ReadableStream).arrayBuffer();
    return { bytes: new Uint8Array(body), contentType: result.ContentType ?? null };
  } catch {
    return null;
  }
}

/** Extract the object key from an `/api/uploads/<key>` URL, or `null` when it is not one. */
export function uploadKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = "/api/uploads/";
  const index = url.indexOf(prefix);
  if (index === -1) return null;
  const key = url.slice(index + prefix.length);
  if (!key || key.includes("..") || key.startsWith("/")) return null;
  return key;
}
