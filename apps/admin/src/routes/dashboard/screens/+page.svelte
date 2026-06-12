<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Screen, type Category, type PlanLimits } from '$lib/api';

  const DISPLAY_URL = (import.meta.env.VITE_DISPLAY_URL as string | undefined) ?? 'http://localhost:4000';

  const THEMES = ['dark', 'warm', 'cool', 'minimal'];
  const LAYOUTS = ['auto', 'grid', 'center'];
  const FONTS = ['default', 'serif', 'rounded', 'condensed', 'mono', 'display'];

  let screens: Screen[] = [];
  let categories: Category[] = [];
  let plan = 'free';
  let limits: PlanLimits | null = null;
  let busy = true;
  let errMsg = '';

  $: atScreenLimit = limits !== null && screens.length >= limits.screens;

  onMount(load);

  async function load() {
    busy = true;
    try {
      const [scr, cats, me] = await Promise.all([api.getScreens(), api.getCategories(), api.me()]);
      screens = scr;
      categories = cats;
      plan = me.tenant?.plan ?? 'free';
      limits = me.limits;
    } catch (e: unknown) {
      errMsg = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function previewUrl(s: Screen): string {
    return `${DISPLAY_URL}/?token=${s.public_token}`;
  }

  async function patch(s: Screen, data: Partial<Screen>) {
    const updated = await api.updateScreen(s.id, data).catch((e: unknown) => { alert((e as Error).message); return null; });
    if (updated) screens = screens.map(x => x.id === s.id ? updated : x);
  }

  async function addScreen() {
    const name = prompt('Naam van het scherm:');
    if (!name?.trim()) return;
    try {
      const s = await api.createScreen(name.trim());
      screens = [...screens, s];
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  async function rename(s: Screen) {
    const name = prompt('Nieuwe naam:', s.name);
    if (!name?.trim() || name === s.name) return;
    await patch(s, { name: name.trim() });
  }

  async function remove(s: Screen) {
    if (!confirm(`Scherm "${s.name}" verwijderen?`)) return;
    try {
      await api.deleteScreen(s.id);
      screens = screens.filter(x => x.id !== s.id);
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  function isSelected(s: Screen, catId: string): boolean {
    return s.category_ids === null ? true : s.category_ids.includes(catId);
  }

  async function toggleCategory(s: Screen, catId: string) {
    const current = new Set(s.category_ids ?? categories.map(c => c.id));
    if (current.has(catId)) current.delete(catId); else current.add(catId);
    // Bewaar in categorie-volgorde; alles geselecteerd = null (toont automatisch nieuwe categorieën).
    const ordered = categories.filter(c => current.has(c.id)).map(c => c.id);
    const value = ordered.length === categories.length ? null : ordered;
    await patch(s, { category_ids: value });
  }

  async function uploadBg(s: Screen, e: Event, kind: 'image' | 'video') {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const { path } = kind === 'image' ? await api.uploadImage(file) : await api.uploadVideo(file);
      await patch(s, kind === 'image' ? { bg_image_path: path } : { bg_video_path: path });
    } catch (ex: unknown) {
      alert((ex as Error).message);
    }
  }

  function copyToken(s: Screen) {
    navigator.clipboard?.writeText(previewUrl(s));
  }
</script>

<div class="wrap">
  <header class="top">
    <a href="/dashboard" class="back">← Menu</a>
    <h1>Schermen</h1>
    {#if limits}
      <span class="usage" class:full={atScreenLimit}>
        {screens.length}/{limits.screens} · {plan === 'pro' ? 'Pro' : 'Free'}
      </span>
    {/if}
    <button class="add" on:click={addScreen} disabled={atScreenLimit}
      title={atScreenLimit ? 'Schermlimiet van je abonnement bereikt' : 'Nieuw scherm'}>
      + Scherm
    </button>
  </header>

  {#if errMsg}<p class="err">{errMsg}</p>{/if}
  {#if busy}
    <p class="muted">Laden…</p>
  {:else}
    <div class="grid">
      {#each screens as s (s.id)}
        <section class="screen">
          <div class="hdr">
            <button class="name" on:click={() => rename(s)} title="Naam wijzigen">{s.name}</button>
            <div class="actions">
              <a href={previewUrl(s)} target="_blank" class="ghost" title="Preview">👁</a>
              <button class="ghost" on:click={() => copyToken(s)} title="Display-link kopiëren">🔗</button>
              <button class="ghost del" on:click={() => remove(s)} title="Verwijderen">✕</button>
            </div>
          </div>

          <div class="row">
            <label>Thema
              <select value={s.theme} on:change={(e) => patch(s, { theme: e.currentTarget.value })}>
                {#each THEMES as t}<option value={t}>{t}</option>{/each}
              </select>
            </label>
            <label>Layout
              <select value={s.layout} on:change={(e) => patch(s, { layout: e.currentTarget.value })}>
                {#each LAYOUTS as l}<option value={l}>{l}</option>{/each}
              </select>
            </label>
            <label>Lettertype
              <select value={s.font} on:change={(e) => patch(s, { font: e.currentTarget.value })}>
                {#each FONTS as f}<option value={f}>{f}</option>{/each}
              </select>
            </label>
          </div>

          <label class="ticker">Ticker
            <input
              type="text"
              value={s.ticker_text ?? ''}
              placeholder="Leeg = geen ticker"
              maxlength="200"
              on:change={(e) => patch(s, { ticker_text: e.currentTarget.value.trim() || null })}
            />
          </label>

          <div class="media">
            <label class="upl">📷 Afbeelding
              <input type="file" accept="image/*" hidden on:change={(e) => uploadBg(s, e, 'image')} />
            </label>
            {#if s.bg_image_path}
              <button class="rm" on:click={() => patch(s, { bg_image_path: null })}>✕ afb.</button>
            {/if}
            <label class="upl">🎬 Video
              <input type="file" accept="video/mp4,video/webm" hidden on:change={(e) => uploadBg(s, e, 'video')} />
            </label>
            {#if s.bg_video_path}
              <button class="rm" on:click={() => patch(s, { bg_video_path: null })}>✕ video</button>
            {/if}
          </div>

          {#if s.bg_image_path && s.bg_video_path}
            <label class="logo-scale">
              <span>Logo-grootte (op video): {s.logo_scale ?? 100}%</span>
              <input
                type="range" min="20" max="200" step="5"
                value={s.logo_scale ?? 100}
                on:change={(e) => patch(s, { logo_scale: +e.currentTarget.value })}
              />
            </label>
          {/if}

          <div class="cats">
            <span class="cats-lbl">Categorieën {s.category_ids === null ? '(alle)' : `(${s.category_ids.length})`}</span>
            <div class="chips">
              {#each categories as c (c.id)}
                <label class="chip" class:on={isSelected(s, c.id)}>
                  <input type="checkbox" checked={isSelected(s, c.id)} on:change={() => toggleCategory(s, c.id)} />
                  {c.name}
                </label>
              {/each}
              {#if categories.length === 0}<span class="muted">Nog geen categorieën</span>{/if}
            </div>
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(body) { background: #0f172a; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 1.5rem; color: #e2e8f0; min-height: 100vh; }
  .top { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; }
  .top h1 { font-size: 1.5rem; margin: 0; flex: 1; }
  .back { color: #94a3b8; text-decoration: none; }
  .back:hover { color: #e2e8f0; }
  .add { background: #4f46e5; color: #fff; border: none; padding: .5rem .9rem; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .add:disabled { opacity: .5; cursor: not-allowed; }
  .usage { font-size: .8rem; color: #94a3b8; background: #1e293b; border: 1px solid #334155; padding: .3rem .6rem; border-radius: 999px; }
  .usage.full { color: #fbbf24; border-color: #a16207; }
  .err { color: #f87171; }
  .muted { color: #64748b; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
  .screen { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; gap: .75rem; }
  .hdr { display: flex; align-items: center; gap: .5rem; }
  .name { flex: 1; text-align: left; background: none; border: none; color: #f8fafc; font-size: 1.05rem; font-weight: 700; cursor: pointer; }
  .actions { display: flex; gap: .25rem; }
  .ghost { background: none; border: none; color: #94a3b8; cursor: pointer; text-decoration: none; padding: .2rem .35rem; border-radius: 4px; font-size: .95rem; }
  .ghost:hover { background: #0f172a; color: #e2e8f0; }
  .ghost.del:hover { color: #f87171; }
  .row { display: flex; gap: .5rem; flex-wrap: wrap; }
  label { display: flex; flex-direction: column; font-size: .72rem; color: #94a3b8; gap: .2rem; }
  select, input[type="text"] { background: #0f172a; border: 1px solid #334155; color: #e2e8f0; border-radius: 5px; padding: .35rem .5rem; font-size: .85rem; }
  .row label { flex: 1; }
  .ticker input { width: 100%; }
  .media { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
  .upl { flex-direction: row; align-items: center; background: #0f172a; border: 1px solid #334155; padding: .35rem .6rem; border-radius: 5px; cursor: pointer; color: #cbd5e1; font-size: .8rem; }
  .upl:hover { border-color: #4f46e5; }
  .rm { background: none; border: 1px solid #334155; color: #94a3b8; border-radius: 5px; padding: .3rem .5rem; cursor: pointer; font-size: .75rem; }
  .rm:hover { color: #f87171; border-color: #f87171; }
  .logo-scale { gap: .35rem; }
  .logo-scale input[type="range"] { width: 100%; accent-color: #4f46e5; }
  .cats-lbl { font-size: .72rem; color: #94a3b8; }
  .chips { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .35rem; }
  .chip { flex-direction: row; align-items: center; gap: .3rem; background: #0f172a; border: 1px solid #334155; padding: .25rem .5rem; border-radius: 999px; font-size: .78rem; color: #cbd5e1; cursor: pointer; }
  .chip.on { background: #312e81; border-color: #4f46e5; color: #e0e7ff; }
  .chip input { accent-color: #4f46e5; }
</style>
