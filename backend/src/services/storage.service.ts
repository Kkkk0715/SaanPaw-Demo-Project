import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { put } from '@vercel/blob';
import { env } from '../config/env';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Serverless platforms (Vercel included) give each function invocation an ephemeral, often
 * read-only filesystem - a file written to local disk is gone, possibly before the response
 * even finishes. Vercel auto-injects this token once Blob storage is enabled for the project,
 * so its presence is what decides where a photo actually goes.
 */
const useBlobStorage = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export const localUploadDir = path.resolve(env.uploadDir);
let localUploadDirReady = false;

/**
 * Saves an uploaded photo and returns the URL clients should use to fetch it - a Vercel Blob
 * URL when deployed there, otherwise a `/uploads/...` path served by app.ts's static route
 * (self-hosted deployments: Docker, a VPS, or plain local development).
 *
 * The local directory is created here, on first use, rather than at module load: creating it
 * eagerly would crash every request (not just uploads) on a host with a read-only filesystem
 * and no BLOB_READ_WRITE_TOKEN, instead of only failing when a photo is actually uploaded.
 */
export async function saveUploadedPhoto(buffer: Buffer, mimeType: string): Promise<string> {
  const filename = `${crypto.randomUUID()}${EXTENSIONS[mimeType] ?? '.jpg'}`;

  if (useBlobStorage) {
    const blob = await put(filename, buffer, { access: 'public', contentType: mimeType });
    return blob.url;
  }

  if (!localUploadDirReady) {
    fs.mkdirSync(localUploadDir, { recursive: true });
    localUploadDirReady = true;
  }
  await fs.promises.writeFile(path.join(localUploadDir, filename), buffer);
  return `/uploads/${filename}`;
}

/** The mime type is client-supplied, so confirm the file really starts like the image it claims to be. */
export function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const head = buffer.subarray(0, 12);
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isWebp;
}
