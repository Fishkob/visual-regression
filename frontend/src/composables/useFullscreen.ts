import { readonly, ref, type Ref } from "vue";

// Immersive mode for a page: the shell (sidebar, header) steps aside and the
// page decides what to do with the room. The native Fullscreen API is a
// best-effort extra on top — an embedding frame, a denied permission or a
// browser without the API still gets the layout, because the layout is the
// point. The ref below is therefore the source of truth and the document is
// only a follower.
//
// Module-level state, like useTheme and useSidebar: the shell has to react
// without prop drilling, and exactly one page can own the mode at a time.
const isFullscreen: Ref<boolean> = ref(false);

// The listeners live for the app's lifetime, not per page: Escape and the
// browser's own fullscreen exit both arrive as events, and re-registering them
// on every toggle would drop the one that is in flight while the page unmounts.
let listening = false;

function clearFullscreen(): void {
  isFullscreen.value = false;
}

function onFullscreenChange(): void {
  // Escape (or F11) leaves the document fullscreen without telling us. The event
  // is the only signal, and it only ever turns the immersive mode off: entering
  // native fullscreen happens through enterFullscreen, which sets the ref first.
  if (document.fullscreenElement === null) clearFullscreen();
}

async function enterFullscreen(): Promise<void> {
  if (isFullscreen.value) return;
  isFullscreen.value = true;
  startListening();
  try {
    await document.documentElement.requestFullscreen();
  } catch {
    // No gesture, no permission, no API: the layout alone still counts.
  }
}

async function exitFullscreen(): Promise<void> {
  if (!isFullscreen.value) return;
  clearFullscreen();
  if (document.fullscreenElement !== null) {
    try {
      await document.exitFullscreen();
    } catch {
      // Already out — the state is what matters.
    }
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !isFullscreen.value) return;
  // A dialog portals to the body and owns Escape while it is open.
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
  event.preventDefault();
  void exitFullscreen();
}

function startListening(): void {
  if (listening) return;
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("keydown", onKeydown);
  listening = true;
}

async function toggleFullscreen(): Promise<void> {
  if (isFullscreen.value) await exitFullscreen();
  else await enterFullscreen();
}

export function useFullscreen() {
  return {
    isFullscreen: readonly(isFullscreen),
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
