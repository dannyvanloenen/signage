<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { dndzone } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { auth } from '$lib/stores';
  import { api, API_URL, type Category, type MenuItem } from '$lib/api';
  import { buildPreviewUrl, nextScale } from '$lib/display-link';

  const DISPLAY_URL = (import.meta.env.VITE_DISPLAY_URL as string | undefined) ?? 'http://localhost:4000';

  const THEMES = [
    { value: 'dark',    label: '◼ Donker' },
    { value: 'warm',    label: '🟠 Warm' },
    { value: 'cool',    label: '🔵 Koel' },
    { value: 'minimal', label: '⬜ Minimaal' },
  ] as const;
  let selectedTheme: string = 'dark';
  let bgUploading = false;
  let videoUploading = false;

  const FONTS = [
    { value: 'default',   label: 'Aa Standaard' },
    { value: 'serif',     label: 'Aa Serif' },
    { value: 'rounded',   label: 'Aa Rond' },
    { value: 'condensed', label: 'Aa Smal' },
    { value: 'mono',      label: 'Aa Mono' },
    { value: 'display',   label: 'Aa Display' },
  ] as const;
  let selectedFont: string = 'default';

  $: previewUrl = buildPreviewUrl(DISPLAY_URL, tenant?.public_token, selectedTheme, selectedFont);
  $: bgUrl = $auth.tenant?.bg_image_path ? `${API_URL}/uploads/${$auth.tenant.bg_image_path}-400w.webp` : null;
  $: videoSet = !!$auth.tenant?.bg_video_path;

  async function uploadBackground(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    bgUploading = true;
    try {
      const { path } = await api.uploadImage(file);
      await api.patch<unknown>('/me/background', { bg_image_path: path });
      auth.update(s => s.tenant ? { ...s, tenant: { ...s.tenant, bg_image_path: path } } : s);
    } catch (ex: unknown) {
      alert((ex as Error).message);
    } finally {
      bgUploading = false;
      (e.target as HTMLInputElement).value = '';
    }
  }

  async function removeBackground() {
    if (!confirm('Achtergrond verwijderen?')) return;
    await api.patch<unknown>('/me/background', { bg_image_path: null });
    auth.update(s => s.tenant ? { ...s, tenant: { ...s.tenant, bg_image_path: null } } : s);
  }

  async function uploadVideo(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    videoUploading = true;
    try {
      const { path } = await api.uploadVideo(file);
      await api.patch<unknown>('/me/video', { bg_video_path: path });
      auth.update(s => s.tenant ? { ...s, tenant: { ...s.tenant, bg_video_path: path } } : s);
    } catch (ex: unknown) {
      alert((ex as Error).message);
    } finally {
      videoUploading = false;
      (e.target as HTMLInputElement).value = '';
    }
  }

  async function removeVideo() {
    if (!confirm('Video verwijderen?')) return;
    await api.patch<unknown>('/me/video', { bg_video_path: null });
    auth.update(s => s.tenant ? { ...s, tenant: { ...s.tenant, bg_video_path: null } } : s);
  }

  let tickerDraft = '';
  let tickerSaving = false;

  async function saveTicker() {
    tickerSaving = true;
    try {
      await api.patch<unknown>('/me/ticker', { ticker_text: tickerDraft.trim() || null });
      auth.update(s => s.tenant ? { ...s, tenant: { ...s.tenant, ticker_text: tickerDraft.trim() || null } } : s);
    } catch (ex: unknown) {
      alert((ex as Error).message);
    } finally {
      tickerSaving = false;
    }
  }

  type CatWithItems = Category & { items: MenuItem[] };

  let cats: CatWithItems[] = [];
  let busy = true;
  let errMsg = '';
  const FD = 200;

  // Modal state
  let modal: MenuItem | null = null;
  let isNew = false;
  let newCatId = '';
  let fName = '', fDesc = '', fPrice = '0,00', fAvail = true, fImg = '';
  let uploading = false, saving = false;
  let photoTab: 'upload' | 'library' = 'upload';
  let libraryImages: { filename: string; label: string; url: string }[] = [];
  let libraryLoading = false;
  let selectedLibraryFile = '';

  onMount(() => {
    tickerDraft = $auth.tenant?.ticker_text ?? '';
    return load();
  });

  async function load() {
    busy = true;
    try {
      const [cs, items] = await Promise.all([api.getCategories(), api.getItems()]);
      cats = cs.map(c => ({
        ...c,
        items: items
          .filter(i => i.category_id === c.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }));
    } catch (e: unknown) {
      errMsg = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  // ── Category DnD ────────────────────────────────────────────────────────────
  function onCatConsider(e: CustomEvent) { cats = e.detail.items; }
  async function onCatFinalize(e: CustomEvent) {
    cats = e.detail.items;
    await api.reorderCategories(cats.map((c, i) => ({ id: c.id, sort_order: i }))).catch(() => {});
  }

  // ── Item DnD ─────────────────────────────────────────────────────────────────
  function onItemConsider(e: CustomEvent, catId: string) {
    cats = cats.map(c => c.id === catId ? { ...c, items: e.detail.items } : c);
  }
  async function onItemFinalize(e: CustomEvent, catId: string) {
    const items: MenuItem[] = e.detail.items;
    cats = cats.map(c => c.id === catId ? { ...c, items } : c);
    await api.reorderItems(items.map((it, i) => ({ id: it.id, sort_order: i }))).catch(() => {});
  }

  // ── Category ops ─────────────────────────────────────────────────────────────
  async function addCat() {
    const name = prompt('Naam categorie:');
    if (!name?.trim()) return;
    const c = await api.createCategory(name.trim());
    cats = [...cats, { ...c, items: [] }];
  }

  async function renameCat(c: CatWithItems) {
    const name = prompt('Nieuwe naam:', c.name);
    if (!name?.trim() || name === c.name) return;
    await api.updateCategory(c.id, { name: name.trim() });
    cats = cats.map(x => x.id === c.id ? { ...x, name: name.trim() } : x);
  }

  async function delCat(id: string) {
    if (!confirm('Categorie en alle items verwijderen?')) return;
    await api.deleteCategory(id);
    cats = cats.filter(c => c.id !== id);
  }

  // Wisselt de fontschaal van een categorie: 100% → 125% → 150% → 100%.
  async function cycleScale(c: CatWithItems) {
    const next = nextScale(c.text_scale ?? 100);
    cats = cats.map(x => x.id === c.id ? { ...x, text_scale: next } : x);
    await api.updateCategory(c.id, { text_scale: next }).catch(() => {});
  }

  // ── Item ops ─────────────────────────────────────────────────────────────────
  function openNew(catId: string) {
    isNew = true; newCatId = catId;
    fName = ''; fDesc = ''; fPrice = '0,00'; fAvail = true; fImg = '';
    photoTab = 'upload'; selectedLibraryFile = '';
    modal = {} as MenuItem;
  }

  function openEdit(item: MenuItem) {
    isNew = false;
    newCatId = item.category_id;
    fName = item.name;
    fDesc = item.description ?? '';
    fPrice = (item.price_cents / 100).toFixed(2).replace('.', ',');
    fAvail = item.is_available;
    fImg = item.image_path ?? '';
    photoTab = 'upload'; selectedLibraryFile = '';
    modal = item;
  }

  async function loadLibrary() {
    if (libraryImages.length > 0) return;
    libraryLoading = true;
    try { libraryImages = await api.getLibrary(); }
    catch { /* stil falen is ok */ }
    finally { libraryLoading = false; }
  }

  async function pickLibraryImage(filename: string) {
    uploading = true;
    selectedLibraryFile = filename;
    try {
      const r = await api.selectLibraryImage(filename);
      fImg = r.path;
    } catch (ex: unknown) {
      selectedLibraryFile = '';
      alert((ex as Error).message);
    } finally {
      uploading = false;
    }
  }

  async function toggleAvail(item: MenuItem) {
    try {
      const updated = await api.toggleAvailability(item.id, !item.is_available);
      cats = cats.map(c => ({ ...c, items: c.items.map(i => i.id === updated.id ? updated : i) }));
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  async function uploadPhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    uploading = true;
    try {
      const r = await api.uploadImage(file);
      fImg = r.path;
    } catch (ex: unknown) {
      alert((ex as Error).message);
    } finally {
      uploading = false;
    }
  }

  async function saveModal() {
    if (!fName.trim()) return;
    saving = true;
    const price = Math.round(parseFloat(fPrice.replace(',', '.')) * 100) || 0;
    try {
      if (isNew) {
        const item = await api.createItem({
          category_id: newCatId,
          name: fName.trim(),
          description: fDesc.trim() || null,
          price_cents: price,
          image_path: fImg || null,
          is_available: fAvail,
          sort_order: 0,
        });
        cats = cats.map(c => c.id === newCatId ? { ...c, items: [...c.items, item] } : c);
      } else if (modal?.id) {
        const oldCatId = modal.category_id;
        const item = await api.updateItem(modal.id, {
          category_id: newCatId,
          name: fName.trim(),
          description: fDesc.trim() || null,
          price_cents: price,
          image_path: fImg || null,
          is_available: fAvail,
        });
        if (oldCatId !== newCatId) {
          // Verplaats item naar andere categorie
          cats = cats.map(c => {
            if (c.id === oldCatId) return { ...c, items: c.items.filter(i => i.id !== item.id) };
            if (c.id === newCatId) return { ...c, items: [...c.items, item] };
            return c;
          });
        } else {
          cats = cats.map(c => ({ ...c, items: c.items.map(i => i.id === item.id ? item : i) }));
        }
      }
      modal = null;
    } catch (ex: unknown) {
      alert((ex as Error).message);
    } finally {
      saving = false;
    }
  }

  async function delItem() {
    if (!modal?.id || !confirm('Item verwijderen?')) return;
    const id = modal.id;
    await api.deleteItem(id);
    cats = cats.map(c => ({ ...c, items: c.items.filter(i => i.id !== id) }));
    modal = null;
  }

  function logout() {
    localStorage.removeItem('jwt');
    goto('/login');
  }

  const fmt = (cents: number) => `€ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  $: tenant = $auth.tenant;
</script>

<div class="shell">
  <header>
    <h1>{tenant?.name ?? 'Signage'}</h1>
    <div class="header-actions">
      {#if tenant}
        <label class="btn-ghost bg-btn" title={bgUploading ? 'Uploaden…' : 'Achtergrond instellen'}>
          {#if bgUploading}
            ⏳
          {:else if bgUrl}
            🖼 Achtergrond
          {:else}
            🖼 Achtergrond
          {/if}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/bmp" on:change={uploadBackground} disabled={bgUploading} hidden />
        </label>
        {#if bgUrl}
          <button class="btn-ghost" on:click={removeBackground} title="Achtergrond verwijderen">✕ Achtergrond</button>
        {/if}
        <label class="btn-ghost bg-btn" title={videoUploading ? 'Uploaden…' : 'Video achtergrond instellen'}>
          {videoUploading ? '⏳' : videoSet ? '🎬 Video ✓' : '🎬 Video'}
          <input type="file" accept="video/mp4,video/webm" on:change={uploadVideo} disabled={videoUploading} hidden />
        </label>
        {#if videoSet}
          <button class="btn-ghost" on:click={removeVideo} title="Video verwijderen">✕ Video</button>
        {/if}
        <select bind:value={selectedTheme} class="theme-select" title="Thema kiezen">
          {#each THEMES as t}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
        <select bind:value={selectedFont} class="theme-select" title="Lettertype kiezen">
          {#each FONTS as f}
            <option value={f.value}>{f.label}</option>
          {/each}
        </select>
        <a href={previewUrl} target="_blank" class="btn-ghost">👁 Preview</a>
        <a href="/dashboard/screens" class="btn-ghost">🖥 Schermen</a>
      {/if}
      <button class="btn-ghost" on:click={logout}>Uitloggen</button>
    </div>
  </header>

  {#if busy}
    <p class="status">Laden…</p>
  {:else if errMsg}
    <p class="status err">{errMsg}</p>
  {:else}
    <div class="toolbar">
      <button class="btn-add" on:click={addCat}>+ Categorie</button>
    </div>

    <div class="ticker-bar">
      <span class="ticker-label">📢</span>
      <input
        class="ticker-input"
        type="text"
        bind:value={tickerDraft}
        placeholder="Ticker tekst voor het scherm (leeg = geen ticker)"
        maxlength="200"
        on:keydown={(e) => e.key === 'Enter' && saveTicker()}
      />
      <button class="ticker-save" on:click={saveTicker} disabled={tickerSaving}>
        {tickerSaving ? '…' : 'OK'}
      </button>
    </div>

    <div
      class="cats"
      use:dndzone={{ items: cats, flipDurationMs: FD, type: 'categories' }}
      on:consider={onCatConsider}
      on:finalize={onCatFinalize}
    >
      {#each cats as cat (cat.id)}
        <div class="cat-card" animate:flip={{ duration: FD }}>
          <div class="cat-header">
            <span class="handle" title="Slepen">⠿</span>
            <button class="cat-name" on:click={() => renameCat(cat)}>{cat.name}</button>
            <button
              class="icon-btn scale"
              on:click={() => cycleScale(cat)}
              title="Fontgrootte op het scherm ({cat.text_scale ?? 100}%) – klik om te wisselen"
            >
              {(cat.text_scale ?? 100) === 100 ? 'A' : `A·${cat.text_scale}%`}
            </button>
            <button class="icon-btn del" on:click={() => delCat(cat.id)} title="Verwijder">✕</button>
          </div>

          <div
            class="items"
            use:dndzone={{ items: cat.items, flipDurationMs: FD, type: `items-${cat.id}` }}
            on:consider={(e) => onItemConsider(e, cat.id)}
            on:finalize={(e) => onItemFinalize(e, cat.id)}
          >
            {#each cat.items as item (item.id)}
              <div class="item-row" animate:flip={{ duration: FD }}>
                <span class="handle small">⠿</span>
                <button class="item-body" on:click={() => openEdit(item)}>
                  <span class="item-name">{item.name}</span>
                  <span class="item-price">{fmt(item.price_cents)}</span>
                </button>
                <button
                  class="avail"
                  class:off={!item.is_available}
                  on:click={() => toggleAvail(item)}
                  title={item.is_available ? 'Beschikbaar – tik om uit te zetten' : 'Uitverkocht – tik om in te zetten'}
                >
                  {item.is_available ? '✓' : '✗'}
                </button>
              </div>
            {/each}
          </div>

          <button class="btn-add-item" on:click={() => openNew(cat.id)}>+ Item toevoegen</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if modal !== null}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="overlay" on:click|self={() => (modal = null)}>
    <div class="modal">
      <h2>{isNew ? 'Nieuw item' : 'Item bewerken'}</h2>

      <label>
        Categorie
        <select bind:value={newCatId} class="cat-select">
          {#each cats as c}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </label>

      <label>Naam *<input bind:value={fName} placeholder="Naam" /></label>
      <label>Omschrijving<textarea bind:value={fDesc} rows="2" placeholder="Optioneel"></textarea></label>
      <label>Prijs (€)<input bind:value={fPrice} placeholder="0,00" inputmode="decimal" /></label>

      <label class="check-row">
        <input type="checkbox" bind:checked={fAvail} />
        <span>Beschikbaar</span>
      </label>

      <div class="photo-label">Foto</div>
      <div class="photo-tabs">
        <button class="ptab" class:active={photoTab === 'upload'} on:click={() => photoTab = 'upload'}>Uploaden</button>
        <button class="ptab" class:active={photoTab === 'library'} on:click={() => { photoTab = 'library'; loadLibrary(); }}>Bibliotheek</button>
      </div>

      {#if photoTab === 'upload'}
        <div class="upload-area">
          {#if fImg}
            <img src="{API_URL}/uploads/{fImg}-400w.webp" alt="preview" class="thumb" />
          {/if}
          <input type="file" accept="image/*" on:change={uploadPhoto} disabled={uploading} />
          {#if uploading}<span class="hint">Uploaden…</span>{/if}
        </div>
      {:else}
        <div class="lib-wrap">
          {#if libraryLoading}
            <span class="hint">Laden…</span>
          {:else if libraryImages.length === 0}
            <p class="hint">Nog geen afbeeldingen.<br>Zet bestanden in <code>apps/api/assets/library/</code></p>
          {:else}
            <div class="lib-grid">
              {#each libraryImages as img}
                <button
                  class="lib-item"
                  class:selected={selectedLibraryFile === img.filename}
                  on:click={() => pickLibraryImage(img.filename)}
                  disabled={uploading}
                >
                  <img src="{API_URL}{img.url}" alt={img.label} />
                  <span>{img.label}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <div class="modal-footer">
        {#if !isNew}
          <button class="btn-del" on:click={delItem}>Verwijderen</button>
        {/if}
        <button class="btn-cancel" on:click={() => (modal = null)}>Annuleren</button>
        <button class="btn-save" on:click={saveModal} disabled={saving || !fName.trim()}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(body) { margin: 0; background: #0f172a; font-family: system-ui, sans-serif; color: #f1f5f9; }
  .shell { max-width: 640px; margin: 0 auto; padding: 0 0 4rem; }

  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: .875rem 1rem; background: #1e293b;
    position: sticky; top: 0; z-index: 10;
    border-bottom: 1px solid #334155;
  }
  h1 { margin: 0; font-size: 1.125rem; }
  .header-actions { display: flex; gap: .5rem; }
  .btn-ghost {
    background: none; border: 1px solid #334155; color: #94a3b8;
    border-radius: 6px; padding: .375rem .75rem; font-size: .8rem; cursor: pointer;
    text-decoration: none;
  }
  .btn-ghost:hover { border-color: #6366f1; color: #6366f1; }
  .theme-select {
    background: #0f172a; border: 1px solid #334155; color: #94a3b8;
    border-radius: 6px; padding: .35rem .6rem; font-size: .8rem; cursor: pointer;
  }
  .theme-select:focus { outline: 2px solid #6366f1; }
  .bg-btn { cursor: pointer; }
  .bg-btn:hover { border-color: #6366f1; color: #6366f1; }

  .status { text-align: center; color: #64748b; padding: 3rem 1rem; }
  .err { color: #f87171; }
  .toolbar { padding: .75rem 1rem; }
  .btn-add {
    background: #6366f1; color: #fff; border: none; border-radius: 8px;
    padding: .625rem 1.25rem; font-size: .9rem; cursor: pointer;
  }
  .ticker-bar {
    display: flex; align-items: center; gap: .5rem;
    padding: .5rem 1rem; border-bottom: 1px solid #1e293b;
  }
  .ticker-label { font-size: 1rem; flex-shrink: 0; }
  .ticker-input {
    flex: 1; background: #0f172a; border: 1px solid #334155; color: #f1f5f9;
    border-radius: 6px; padding: .5rem .75rem; font-size: .85rem;
  }
  .ticker-input:focus { outline: 2px solid #6366f1; border-color: transparent; }
  .ticker-save {
    background: #334155; color: #cbd5e1; border: none; border-radius: 6px;
    padding: .5rem .875rem; font-size: .85rem; cursor: pointer; flex-shrink: 0;
  }
  .ticker-save:hover { background: #6366f1; color: #fff; }
  .ticker-save:disabled { opacity: .5; }

  .cats { display: flex; flex-direction: column; gap: .75rem; padding: .5rem 1rem; }

  .cat-card {
    background: #1e293b; border-radius: 10px;
    border: 1px solid #334155; overflow: hidden;
  }
  .cat-header {
    display: flex; align-items: center; gap: .5rem;
    padding: .625rem .75rem; background: #162032;
    border-bottom: 1px solid #334155;
  }
  .cat-name {
    flex: 1; background: none; border: none; color: #e2e8f0;
    font-size: .95rem; font-weight: 600; text-align: left; cursor: pointer;
    padding: .25rem 0;
  }
  .cat-name:hover { color: #6366f1; }

  .handle {
    color: #475569; cursor: grab; font-size: 1.1rem; user-select: none;
    padding: .125rem .25rem;
  }
  .handle.small { font-size: .95rem; }
  .icon-btn { background: none; border: none; cursor: pointer; font-size: .9rem; padding: .25rem .375rem; border-radius: 4px; }
  .del { color: #64748b; }
  .del:hover { color: #f87171; background: #1e1a2e; }
  .scale { color: #64748b; font-weight: 700; min-width: 1.5rem; }
  .scale:hover { color: #818cf8; background: #1e1a2e; }

  .items { display: flex; flex-direction: column; min-height: 4px; }
  .item-row {
    display: flex; align-items: center; gap: .375rem;
    padding: .5rem .75rem; border-bottom: 1px solid #1e293b;
    background: #1e293b;
  }
  .item-row:last-child { border-bottom: none; }
  .item-body {
    flex: 1; display: flex; align-items: baseline; justify-content: space-between;
    gap: .5rem; background: none; border: none; cursor: pointer; text-align: left;
    color: inherit; padding: .125rem 0;
  }
  .item-name { font-size: .9rem; color: #e2e8f0; }
  .item-price { font-size: .8rem; color: #64748b; white-space: nowrap; }
  .item-body:hover .item-name { color: #6366f1; }

  .avail {
    width: 2rem; height: 2rem; border-radius: 50%; border: 2px solid #22c55e;
    background: #14532d; color: #22c55e; font-size: .875rem;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .avail.off { border-color: #ef4444; background: #450a0a; color: #ef4444; }

  .btn-add-item {
    width: 100%; background: none; border: none; border-top: 1px dashed #334155;
    color: #6366f1; padding: .625rem; font-size: .85rem; cursor: pointer;
  }
  .btn-add-item:hover { background: #162032; }

  /* Modal */
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.7);
    display: flex; align-items: flex-end; justify-content: center;
    z-index: 100; padding: 1rem;
  }
  .modal {
    background: #1e293b; border-radius: 16px 16px 12px 12px;
    width: 100%; max-width: 560px; max-height: 90vh;
    overflow-y: auto; padding: 1.25rem 1rem 1.5rem;
  }
  h2 { margin: 0 0 1.25rem; font-size: 1.1rem; color: #f1f5f9; }
  label {
    display: flex; flex-direction: column; gap: .3rem;
    margin-bottom: .875rem; font-size: .8rem; color: #94a3b8;
  }
  label.check-row { flex-direction: row; align-items: center; gap: .5rem; font-size: .875rem; }
  .cat-select,
  input:not([type="checkbox"]):not([type="file"]), textarea {
    background: #0f172a; border: 1px solid #334155; color: #f1f5f9;
    border-radius: 8px; padding: .625rem .875rem; font-size: .9rem;
    font-family: inherit;
  }
  input:focus, textarea:focus { outline: 2px solid #6366f1; border-color: transparent; }
  input[type="checkbox"] { width: 1.1rem; height: 1.1rem; accent-color: #6366f1; }
  input[type="file"] { color: #94a3b8; font-size: .8rem; }
  .thumb { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; }
  .hint { font-size: .8rem; color: #64748b; }

  .photo-label { font-size: .8rem; color: #94a3b8; margin-bottom: .3rem; }
  .photo-tabs { display: flex; gap: .375rem; margin-bottom: .5rem; }
  .ptab {
    background: #0f172a; border: 1px solid #334155; color: #64748b;
    border-radius: 6px; padding: .3rem .75rem; font-size: .78rem; cursor: pointer;
  }
  .ptab.active { border-color: #6366f1; color: #6366f1; background: rgba(99,102,241,.08); }
  .upload-area { display: flex; flex-direction: column; gap: .4rem; }
  .lib-wrap { max-height: 220px; overflow-y: auto; }
  .lib-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: .5rem;
  }
  .lib-item {
    background: #0f172a; border: 2px solid #1e293b; border-radius: 8px;
    cursor: pointer; padding: .3rem; display: flex; flex-direction: column;
    align-items: center; gap: .25rem; transition: border-color .15s;
  }
  .lib-item img { width: 64px; height: 64px; object-fit: cover; border-radius: 4px; }
  .lib-item span { font-size: .65rem; color: #94a3b8; text-align: center; line-height: 1.2; }
  .lib-item:hover { border-color: #6366f1; }
  .lib-item.selected { border-color: #22c55e; }
  .lib-item:disabled { opacity: .5; cursor: not-allowed; }

  .modal-footer {
    display: flex; gap: .5rem; justify-content: flex-end;
    margin-top: 1.25rem; flex-wrap: wrap;
  }
  .btn-del { background: #450a0a; color: #f87171; border: none; border-radius: 8px; padding: .625rem 1rem; font-size: .875rem; cursor: pointer; margin-right: auto; }
  .btn-cancel { background: #334155; color: #cbd5e1; border: none; border-radius: 8px; padding: .625rem 1rem; font-size: .875rem; cursor: pointer; }
  .btn-save { background: #6366f1; color: #fff; border: none; border-radius: 8px; padding: .625rem 1.25rem; font-size: .875rem; cursor: pointer; }
  .btn-save:disabled { opacity: .5; cursor: not-allowed; }
</style>
