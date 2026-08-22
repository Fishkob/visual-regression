import { createApp } from "vue";
import App from "./App.vue";
import router from "./router/index.ts";

import "./style.css";
import "vue-sonner/style.css";

import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import { client } from "@sdk/client.gen";
import { initObservability, reportError } from "@/lib/observability";

const app = createApp(App);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 300_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

app.use(router);
app.use(VueQueryPlugin, { queryClient });

initObservability(client);

app.config.errorHandler = (err, _instance, info) => {
  reportError(err, { vueInfo: info });
};

app.mount("#app");
