import { watchEffect } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { documentTitle } from "@/lib/document-title";

// One owner of the browser tab title: it follows the route and the active
// locale, so a German UI does not keep an English title after a language
// switch and a bookmarked tab names the page it shows.
export function useDocumentTitle(): void {
  const route = useRoute();
  const { t } = useI18n();

  watchEffect(() => {
    document.title = documentTitle(route, t);
  });
}
