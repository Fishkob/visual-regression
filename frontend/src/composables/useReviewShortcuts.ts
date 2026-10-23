import { onBeforeUnmount, onMounted } from "vue";

function isEnabled(value: boolean | (() => boolean) | undefined): boolean {
  return typeof value === "function" ? value() : value !== false;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function useReviewShortcuts(options: {
  onApprove: () => void;
  onSkip: () => void;
  onBack: () => void;
  enabled?: boolean | (() => boolean);
  canBack?: boolean | (() => boolean);
}) {
  function handler(event: KeyboardEvent) {
    const canAct = isEnabled(options.enabled);
    const canBack = isEnabled(options.canBack ?? options.enabled);
    if (event.repeat || event.defaultPrevented) return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
      return;
    if (isEditable(event.target)) return;

    if (event.key.toLowerCase() === "a" && canAct) {
      event.preventDefault();
      options.onApprove();
    } else if (event.key.toLowerCase() === "s" && canAct) {
      event.preventDefault();
      options.onSkip();
    } else if (event.key === "Escape" && canBack) {
      event.preventDefault();
      options.onBack();
    }
  }

  onMounted(() => window.addEventListener("keydown", handler));
  onBeforeUnmount(() => window.removeEventListener("keydown", handler));
}
