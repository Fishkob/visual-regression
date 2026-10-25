import { createApp, h, shallowRef, type App, type Component } from "vue";

import router from "../../src/router/index.ts";
import { VueQueryPlugin } from "@tanstack/vue-query";

import { queryClient } from "../../src/lib/query-client";
import { authQueryKeys } from "../../src/domains/auth/query-keys";

import "../../src/style.css";
import "vue-sonner/style.css";

const stories = import.meta.glob("../../src/**/*.story.{ts,js,vue}");
const id = (f: string) =>
  f.replace(/^(\.\.\/)+src\//, "").replace(/\.story\.\w+$/, "");

async function resolve(storyId: string) {
  const byPath = Object.keys(stories).find(
    (f) => id(f) === storyId || id(f).endsWith("/" + storyId),
  );
  if (byPath) {
    const mod = (await stories[byPath]()) as
      Record<string, unknown> | undefined;
    return mod?.default;
  }

  const sep = storyId.lastIndexOf("/");
  const [path, name] = [storyId.slice(0, sep), storyId.slice(sep + 1)];
  const file = Object.keys(stories).find(
    (f) => id(f) === path || id(f).endsWith("/" + path),
  );
  const mod = (file && (await stories[file]())) as
    Record<string, unknown> | undefined;
  return mod?.[name] ?? mod?.default;
}

const story = shallowRef<Component | null>(null);
const props = shallowRef<Record<string, unknown>>({});
const host = {
  render: () => (story.value ? h(story.value, props.value) : null),
};
let app: App | undefined;

// Component tests exercise views, not auth: the router guard resolves /me
// through the shared query client on every navigation, so seed a session and
// the guard lets routed stories through without a backend round-trip. The role
// is ADMIN so the gallery renders the admin-only navigation and pages; a role
// the UI no longer knows would hide those links from every story.
queryClient.setQueryData(authQueryKeys.me(), {
  username: "gallery-user",
  role: "ADMIN",
  mustChangePassword: false,
});

async function mountNext({
  story: storyId,
  props: next,
}: {
  story: string;
  props?: Record<string, unknown>;
}) {
  const resolved = await resolve(storyId);
  if (!resolved) {
    throw new Error(`Unknown story: ${storyId}`);
  }
  story.value = resolved as Component;
  props.value = next ?? {};
  if (!app) {
    app = createApp(host);
    app.use(router);
    app.use(VueQueryPlugin, { queryClient });
    app.mount("#root");
  }
}

async function unmount() {
  app?.unmount();
  app = undefined;
}

(window as unknown as Record<string, unknown>).mount = mountNext;
(window as unknown as Record<string, unknown>).unmount = unmount;
