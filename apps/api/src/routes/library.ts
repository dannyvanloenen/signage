import type { FastifyPluginAsync } from 'fastify';
import { existsSync } from 'fs';
import { readdir, mkdir, rm } from 'fs/promises';
import { join, resolve, extname, basename } from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { requireAuth } from '../lib/auth.js';

const LIBRARY_DIR = resolve('./assets/library');
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const SIZES = [400, 800, 1600] as const;

function toLabel(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const libraryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireAuth }, async () => {
    if (!existsSync(LIBRARY_DIR)) return [];
    const files = await readdir(LIBRARY_DIR);
    return files
      .filter((f) => ALLOWED_EXT.has(extname(f).toLowerCase()) && !f.startsWith('.'))
      .sort()
      .map((f) => ({ filename: f, label: toLabel(f), url: `/library/${f}` }));
  });

  app.post<{ Body: unknown }>(
    '/select',
    { preHandler: requireAuth },
    async (request, reply) => {
      const body = request.body as { filename?: unknown };
      const filename = typeof body?.filename === 'string' ? body.filename : null;

      if (!filename || filename.includes('/') || filename.includes('..') || filename.includes('\\')) {
        return reply.status(400).send({ error: 'Ongeldig bestandsnaam' });
      }

      const src = join(LIBRARY_DIR, filename);
      if (!existsSync(src) || !ALLOWED_EXT.has(extname(filename).toLowerCase())) {
        return reply.status(404).send({ error: 'Bestand niet gevonden in bibliotheek' });
      }

      const uploadDir = resolve(config.UPLOAD_DIR);
      await mkdir(uploadDir, { recursive: true });

      const id = randomUUID();
      const written: string[] = [];

      try {
        const processor = sharp(src);
        await Promise.all(
          SIZES.map(async (w) => {
            const dest = join(uploadDir, `${id}-${w}w.webp`);
            await processor
              .clone()
              .resize({ width: w, withoutEnlargement: true })
              .webp({ quality: 82 })
              .toFile(dest);
            written.push(dest);
          }),
        );
      } catch {
        await Promise.allSettled(written.map((f) => rm(f, { force: true })));
        return reply.status(400).send({ error: 'Verwerking mislukt' });
      }

      return { id, path: id, url: `/uploads/${id}-800w.webp` };
    },
  );
};

export default libraryRoutes;
