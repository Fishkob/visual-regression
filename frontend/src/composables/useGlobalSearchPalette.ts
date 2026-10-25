import { ref } from "vue";

// The palette is mounted once in the shell but opened from the header button and
// from Ctrl/Cmd+K; module-level state is the smallest shared owner (the same
// convention as the sidebar/theme composables).
const open = ref(false);

export function useGlobalSearchPalette() {
  function openPalette(): void {
    open.value = true;
  }

  function closePalette(): void {
    open.value = false;
  }

  function togglePalette(): void {
    open.value = !open.value;
  }

  return { open, openPalette, closePalette, togglePalette };
}
