export type UserRole = 'owner' | 'admin';

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: UserRole;
}
