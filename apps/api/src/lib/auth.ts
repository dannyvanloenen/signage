import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }
  if (request.user.role !== 'admin') {
    reply.status(403).send({ error: 'Forbidden' });
  }
}
