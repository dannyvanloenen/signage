<script lang="ts">
  import { api } from '$lib/api';

  let email = '';
  let sent = false;
  let error = '';
  let loading = false;

  async function submit() {
    error = '';
    loading = true;
    try {
      await api.magicLink(email);
      sent = true;
    } catch (e: unknown) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
</script>

<main>
  <div class="card">
    <h1>Inloggen</h1>

    {#if sent}
      <p class="success">Check je e-mail voor de inloglink.</p>
    {:else}
      <form on:submit|preventDefault={submit}>
        <label for="email">E-mailadres</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="jij@voorbeeld.nl"
          autocomplete="email"
          required
        />
        {#if error}<p class="error">{error}</p>{/if}
        <button type="submit" disabled={loading || !email}>
          {loading ? 'Verzenden…' : 'Stuur inloglink'}
        </button>
      </form>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f172a;
    padding: 1rem;
  }
  .card {
    background: #1e293b;
    border-radius: 12px;
    padding: 2rem;
    width: 100%;
    max-width: 360px;
    box-shadow: 0 4px 24px rgba(0,0,0,.4);
  }
  h1 { color: #f1f5f9; font-size: 1.5rem; margin: 0 0 1.5rem; }
  label { display: block; color: #94a3b8; font-size: .875rem; margin-bottom: .4rem; }
  input {
    width: 100%; box-sizing: border-box;
    padding: .75rem 1rem; border-radius: 8px;
    border: 1px solid #334155; background: #0f172a;
    color: #f1f5f9; font-size: 1rem; margin-bottom: 1rem;
  }
  input:focus { outline: 2px solid #6366f1; border-color: transparent; }
  button {
    width: 100%; padding: .875rem;
    background: #6366f1; color: #fff;
    border: none; border-radius: 8px;
    font-size: 1rem; cursor: pointer;
  }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .error { color: #f87171; font-size: .875rem; margin: -.5rem 0 .75rem; }
  .success { color: #4ade80; line-height: 1.5; }
</style>
