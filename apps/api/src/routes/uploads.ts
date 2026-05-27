import type { FastifyPluginAsync } from 'fastify';
import { createWriteStream } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { requireAuth } from '../lib/auth.js';

const SIZES = [400, 800, 1600] as const;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm']);
const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm' };

export const uploadsRoutes: FastifyPluginAsync = async (app) => {
  const uploadDir = resolve(config.UPLOAD_DIR);
  await mkdir(uploadDir, { recursive: true });

  app.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'Geen bestand ontvangen' });

    if (!ALLOWED_MIME.has(data.mimetype)) {
      await data.file.resume();
      return reply.status(400).send({ error: 'Alleen afbeeldingen toegestaan (jpeg, png, webp, gif, avif)' });
    }

    const buffer = await data.toBuffer();

    // Controleer of de upload werd afgekapt (bestand te groot)
    if ((data.file as any).truncated) {
      return reply.status(400).send({ error: 'Bestand te groot (max 5 MB)' });
    }

    const id = randomUUID();
    const written: string[] = [];

    try {
      const processor = sharp(buffer);

      await Promise.all(
        SIZES.map(async (w) => {
          const dest = join(uploadDir, `${id}-${w}w.webp`);
          await processor
            .clone()
            .resize({ width: w, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(dest);
          written.push(dest);
        })
      );
    } catch {
      // Ruim eventueel deels geschreven bestanden op
      await Promise.allSettled(written.map((f) => rm(f, { force: true })));
      return reply.status(400).send({ error: 'Ongeldig of corrupt afbeeldingsbestand' });
    }

    return {
      id,
      path: id,
      url: `/uploads/${id}-800w.webp`,
      sizes: Object.fromEntries(SIZES.map((w) => [w, `/uploads/${id}-${w}w.webp`])),
    };
  });

  app.post('/video', { preHandler: requireAuth }, async (request, reply) => {
    const data = await request.file({ limits: { fileSize: 50 * 1024 * 1024 } });
    if (!data) return reply.status(400).send({ error: 'Geen bestand ontvangen' });

    if (!ALLOWED_VIDEO_MIME.has(data.mimetype)) {
      await data.file.resume();
      return reply.status(400).send({ error: 'Alleen MP4 en WebM toegestaan' });
    }

    const ext = VIDEO_EXT[data.mimetype];
    const id = randomUUID();
    const dest = join(uploadDir, `${id}.${ext}`);

    try {
      await pipeline(data.file, createWriteStream(dest));
    } catch {
      await rm(dest, { force: true });
      return reply.status(500).send({ error: 'Upload mislukt' });
    }

    if ((data.file as any).truncated) {
      await rm(dest, { force: true });
      return reply.status(400).send({ error: 'Bestand te groot (max 50 MB)' });
    }

    return { id, path: `${id}.${ext}`, url: `/uploads/${id}.${ext}` };
  });
};

export default uploadsRoutes;
