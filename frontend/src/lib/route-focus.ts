import { nextTick } from "vue";

export async function focusRouteContent(skip = false): Promise<void> {
  if (skip) return;
  await nextTick();
  const main = document.querySelector<HTMLElement>("main");
  const target = main?.querySelector<HTMLElement>("h1, h2") ?? main ?? null;
  if (!target) return;
  target.setAttribute("tabindex", "-1");
  // Programmatic focus moves the screen reader to the new page; the heading was
  // not tabbed to, so do not paint a focus ring around it.
  target.classList.add("route-focus");
  target.focus();
}
