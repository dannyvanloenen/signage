<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores';
  import { api } from '$lib/api';

  const PUBLIC = ['/login', '/verify'];

  onMount(async () => {
    const token = localStorage.getItem('jwt');
    const isPublic = PUBLIC.some(p => $page.url.pathname.startsWith(p));

    if (!token) {
      auth.set({ user: null, tenant: null, ready: true });
      if (!isPublic) goto('/login');
      return;
    }

    try {
      const { user, tenant } = await api.me();
      auth.set({ user, tenant, ready: true });
      if (isPublic) goto('/dashboard');
    } catch {
      localStorage.removeItem('jwt');
      auth.set({ user: null, tenant: null, ready: true });
      goto('/login');
    }
  });
</script>

<slot />
