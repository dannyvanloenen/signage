import { writable } from 'svelte/store';
import type { User, Tenant } from './api';

export const auth = writable<{ user: User | null; tenant: Tenant | null; ready: boolean }>({
  user: null,
  tenant: null,
  ready: false,
});
