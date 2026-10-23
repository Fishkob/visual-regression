import { ref, watch, type Ref } from "vue";

const STORAGE_KEY = "sidebar-collapsed";

let initialized = false;
const collapsed: Ref<boolean> = ref(false);

export function useSidebar() {
  if (!initialized) {
    collapsed.value = localStorage.getItem(STORAGE_KEY) === "true";
    watch(collapsed, (value) => {
      localStorage.setItem(STORAGE_KEY, String(value));
    });
    initialized = true;
  }

  function toggle() {
    collapsed.value = !collapsed.value;
  }

  return {
    collapsed,
    toggle,
  };
}
