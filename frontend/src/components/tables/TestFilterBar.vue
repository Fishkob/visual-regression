<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
  FILTER_ALL,
  STATUS_FILTER_OK,
  STATUS_FILTER_PENDING,
  type VisualTestFilters,
} from "@/domains/test-status";
import { IMAGE_TEST_KIND, PDF_TEST_KIND } from "@/domains/test-kind";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Monitor, Globe, Filter, FileText, RefreshCcw } from "@lucide/vue";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();

defineProps<{
  filters: VisualTestFilters;
  viewports: string[];
  browsers: string[];
  environments: string[];
}>();

const emit = defineEmits<{
  "update:filters": [value: VisualTestFilters];
  reset: [];
}>();
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border/70"
  >
    <div class="flex flex-wrap gap-4 items-center">
      <div class="flex items-center gap-2 min-w-[140px]">
        <Monitor class="w-4 h-4 text-muted-foreground" />
        <Select
          :model-value="filters.viewport"
          @update:model-value="
            emit('update:filters', { ...filters, viewport: String($event) })
          "
        >
          <SelectTrigger
            class="min-w-[130px]"
            :aria-label="t('filterBar.viewportLabel')"
            :data-testid="TEST_ID.filterViewport"
          >
            <SelectValue :placeholder="t('filterBar.viewport')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("filterBar.viewports")
            }}</SelectItem>
            <SelectItem v-for="v in viewports" :key="v" :value="v">{{
              v
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2 min-w-[140px]">
        <Globe class="w-4 h-4 text-muted-foreground" />
        <Select
          :model-value="filters.browser"
          @update:model-value="
            emit('update:filters', { ...filters, browser: String($event) })
          "
        >
          <SelectTrigger
            class="min-w-[130px]"
            :aria-label="t('filterBar.browserLabel')"
            :data-testid="TEST_ID.filterBrowser"
          >
            <SelectValue :placeholder="t('filterBar.browser')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("filterBar.browser")
            }}</SelectItem>
            <SelectItem v-for="b in browsers" :key="b" :value="b">{{
              b
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2 min-w-[160px]">
        <Globe class="w-4 h-4 text-muted-foreground" />
        <Select
          :model-value="filters.environment"
          @update:model-value="
            emit('update:filters', {
              ...filters,
              environment: String($event),
            })
          "
        >
          <SelectTrigger
            class="min-w-[130px]"
            :aria-label="t('filterBar.environmentLabel')"
            :data-testid="TEST_ID.filterEnvironment"
          >
            <SelectValue :placeholder="t('filterBar.environment')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("filterBar.environments")
            }}</SelectItem>
            <SelectItem v-for="e in environments" :key="e" :value="e">{{
              e
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2 min-w-[140px]">
        <FileText class="w-4 h-4 text-muted-foreground" />
        <Select
          :model-value="filters.kind"
          @update:model-value="
            emit('update:filters', { ...filters, kind: String($event) })
          "
        >
          <SelectTrigger
            class="min-w-[130px]"
            :aria-label="t('filterBar.kindLabel')"
            :data-testid="TEST_ID.filterKind"
          >
            <SelectValue :placeholder="t('filterBar.kind')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("filterBar.allKinds")
            }}</SelectItem>
            <SelectItem :value="IMAGE_TEST_KIND">{{
              t("filterBar.images")
            }}</SelectItem>
            <SelectItem :value="PDF_TEST_KIND">{{
              t("filterBar.pdfs")
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2 min-w-[140px]">
        <Filter class="w-4 h-4 text-muted-foreground" />
        <Select
          :model-value="filters.status"
          @update:model-value="
            emit('update:filters', { ...filters, status: String($event) })
          "
        >
          <SelectTrigger
            class="min-w-[130px]"
            :aria-label="t('filterBar.statusLabel')"
            :data-testid="TEST_ID.filterStatus"
          >
            <SelectValue :placeholder="t('filterBar.status')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">{{
              t("filterBar.status")
            }}</SelectItem>
            <SelectItem :value="STATUS_FILTER_PENDING">{{
              t("filterBar.pending")
            }}</SelectItem>
            <SelectItem :value="STATUS_FILTER_OK">OK</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        class="ml-2 flex items-center gap-2"
        @click="emit('reset')"
        :data-testid="TEST_ID.resetFilter"
      >
        <RefreshCcw class="w-4 h-4" /> {{ t("filterBar.reset") }}
      </Button>
    </div>

    <Input
      :model-value="filters.search"
      @update:model-value="
        emit('update:filters', { ...filters, search: $event as string })
      "
      :placeholder="t('filterBar.searchPlaceholder')"
      :aria-label="t('filterBar.searchLabel')"
      class="w-64 rounded-xl shadow-sm"
      :data-testid="TEST_ID.testSearch"
    />
  </div>
</template>
