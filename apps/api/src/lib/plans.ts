import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tenants } from '../db/schema.js';

export type Plan = 'free' | 'pro';

export interface PlanLimits {
  screens: number;
  categories: number;
  items: number;
}

/** Limieten per abonnement. Pas hier aan om tiers te wijzigen. */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { screens: 2, categories: 10, items: 60 },
  pro: { screens: 25, categories: 100, items: 1000 },
};

export function limitsFor(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[(plan as Plan)] ?? PLAN_LIMITS.free;
}

/** Haalt de limieten voor de tenant op basis van zijn abonnement. */
export async function planLimits(tenantId: string): Promise<PlanLimits> {
  const [t] = await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return limitsFor(t?.plan);
}
