import { createApp } from "vue";
import App from "./App.vue";
import router from "./router/index.ts";

import "./style.css";
import "vue-sonner/style.css";

import { VueQueryPlugin } from "@tanstack/vue-query";
import { client } from "@sdk/client.gen";
import { initObservability, reportError } from "@/lib/observability";
import { handleUnauthorized } from "@/lib/auth-redirect";
import { queryClient } from "@/lib/query-client";

const app = createApp(App);

app.use(router);
app.use(VueQueryPlugin, { queryClient });

initObservability(client);

// The generated client bakes the absolute backend origin into its baseUrl
// (from the Swagger server URL). Browser calls to a different origin would be
// cross-origin and drop the session cookie, so route through the same-origin
// proxy (Vite dev / nginx) instead: cookies then flow with fetch's default
// credentials policy and no explicit credentials config is needed.
client.setConfig({ baseUrl: "/api/v1" });
client.interceptors.response.use((response) => {
  if (response.status === 401 && !response.url.endsWith("/auth/login")) {
    handleUnauthorized();
  }
  return response;
});

app.config.errorHandler = (err, _instance, info) => {
  reportError(err, { vueInfo: info });
};

app.mount("#app");
