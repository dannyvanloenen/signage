<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores';
  import { api } from '$lib/api';

  let error = '';

  onMount(async () => {
    const token = $page.url.searchParams.get('token');
    if (!token) { error = 'Geen token gevonden in de link.'; return; }

    try {
      const { token: jwt } = await api.verifyToken(token);
      localStorage.setItem('jwt', jwt);
      const { user, tenant } = await api.me();
      auth.set({ user, tenant, ready: true });
      goto('/dashboard', { replaceState: true });
    } catch (e: unknown) {
      error = (e as Error).message || 'Ongeldige of verlopen link.';
    }
  });
</script>

<main>
  <div class="card">
    {#if error}
      <p class="error">{error}</p>
      <a href="/login">Opnieuw inloggen</a>
    {:else}
      <p class="info">Inloggen…</p>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100vh; display: flex;
    align-items: center; justify-content: center;
    background: #0f172a; padding: 1rem;
  }
  .card {
    background: #1e293b; border-radius: 12px;
    padding: 2rem; text-align: center;
    max-width: 360px; width: 100%;
  }
  .error { color: #f87171; margin: 0 0 1rem; }
  .info { color: #94a3b8; }
  a { color: #6366f1; }
</style>
