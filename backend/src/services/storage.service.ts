import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { put } from '@vercel/blob';
import { env } from '../config/env';
import { Photo } from '../models/Photo';
import { ApiError } from '../utils/ApiError';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Where a photo goes depends on the host:
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (Vercel injects it once Blob storage is enabled)
 *  - the database on Vercel without Blob: its filesystem is read-only, so disk is not an option
 *  - local disk everywhere else (Docker, a VPS, plain local development)
 */
const useBlobStorage = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const useDatabaseStorage = !useBlobStorage && Boolean(process.env.VERCEL);

export const localUploadDir = path.resolve(env.uploadDir);
let localUploadDirReady = false;

/** Ids the database storage hands out, as opposed to the UUID file names used on disk. */
export const isDatabasePhotoId = (name: string) => /^[a-f0-9]{24}$/i.test(name.replace(/\.[a-z]+$/i, ''));

/**
 * Saves an uploaded photo and returns the URL clients should use to fetch it - a Vercel Blob
 * URL, or a `/uploads/...` path served by this API (from the database or, self-hosted, from disk).
 */
export async function saveUploadedPhoto(buffer: Buffer, mimeType: string): Promise<string> {
  if (useBlobStorage) {
    const filename = `${crypto.randomUUID()}${EXTENSIONS[mimeType] ?? '.jpg'}`;
    const blob = await put(filename, buffer, { access: 'public', contentType: mimeType });
    return blob.url;
  }

  if (useDatabaseStorage) {
    const photo = await Photo.create({ contentType: mimeType, data: buffer });
    return `/uploads/${photo._id}`;
  }

  const filename = `${crypto.randomUUID()}${EXTENSIONS[mimeType] ?? '.jpg'}`;
  try {
    if (!localUploadDirReady) {
      fs.mkdirSync(localUploadDir, { recursive: true });
      localUploadDirReady = true;
    }
    await fs.promises.writeFile(path.join(localUploadDir, filename), buffer);
  } catch {
    throw new ApiError(503, 'Photo storage is unavailable on this server. Try again later.');
  }
  return `/uploads/${filename}`;
}

export async function readDatabasePhoto(name: string) {
  const id = name.replace(/\.[a-z]+$/i, '');
  return Photo.findById(id);
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
