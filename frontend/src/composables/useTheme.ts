import { ref, watch, type Ref } from "vue";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

let initialized = false;
const theme: Ref<Theme> = ref("light");

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function useTheme() {
  if (!initialized) {
    theme.value = getInitialTheme();
    applyTheme(theme.value);
    watch(theme, (t) => {
      localStorage.setItem(STORAGE_KEY, t);
      applyTheme(t);
    });
    initialized = true;
  }

  function toggle() {
    theme.value = theme.value === "light" ? "dark" : "light";
  }

  return {
    theme,
    toggle,
  };
}
