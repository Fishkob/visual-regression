<script setup lang="ts">
import {
  FILTER_ALL,
  STATUS_FILTER_OK,
  STATUS_FILTER_PENDING,
  type VisualTestFilters,
} from "@/domains/test-status";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Monitor, Globe, Filter, RefreshCcw } from "@lucide/vue";

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
          <SelectTrigger class="min-w-[130px]">
            <SelectValue placeholder="Viewport" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">Viewports</SelectItem>
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
          <SelectTrigger class="min-w-[130px]">
            <SelectValue placeholder="Browser" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">Browser</SelectItem>
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
          <SelectTrigger class="min-w-[130px]">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">Environments</SelectItem>
            <SelectItem v-for="e in environments" :key="e" :value="e">{{
              e
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
          <SelectTrigger class="min-w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">Status</SelectItem>
            <SelectItem :value="STATUS_FILTER_PENDING">Pending</SelectItem>
            <SelectItem :value="STATUS_FILTER_OK">OK</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        class="ml-2 flex items-center gap-2"
        @click="emit('reset')"
        data-testid="reset-filter"
      >
        <RefreshCcw class="w-4 h-4" /> Reset
      </Button>
    </div>

    <Input
      :model-value="filters.search"
      @update:model-value="
        emit('update:filters', { ...filters, search: $event as string })
      "
      placeholder="Search test name…"
      class="w-64 rounded-xl shadow-sm"
    />
  </div>
</template>
