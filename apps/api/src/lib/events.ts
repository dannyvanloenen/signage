import { publisher } from './redis.js';

export async function publishMenuUpdate(tenantId: string): Promise<void> {
  await publisher.publish('menu:updated', tenantId);
}
