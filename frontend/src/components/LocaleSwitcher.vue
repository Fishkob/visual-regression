<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n";
import { TEST_ID } from "@/lib/test-ids";

const { t, locale } = useI18n();

function change(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if ((SUPPORTED_LOCALES as readonly string[]).includes(value)) {
    setLocale(value as SupportedLocale);
  }
}
</script>

<template>
  <label class="sr-only" for="locale-switcher">{{
    t("header.language")
  }}</label>
  <select
    id="locale-switcher"
    class="rounded-md border bg-card px-2 py-1 text-xs"
    :value="locale"
    :aria-label="t('header.language')"
    :data-testid="TEST_ID.localeSwitcher"
    @change="change"
  >
    <option value="en">EN</option>
    <option value="de">DE</option>
  </select>
</template>
