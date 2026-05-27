<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto(localStorage.getItem('jwt') ? '/dashboard' : '/login', { replaceState: true });
  });
</script>
