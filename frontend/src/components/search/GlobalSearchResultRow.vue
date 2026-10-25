<script setup lang="ts">
import { Star } from "@lucide/vue";
import type { SearchResultItem } from "@/domains/search/search.model";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{
  item: SearchResultItem;
  active: boolean;
  favorite: boolean;
}>();

defineEmits<{
  select: [];
  toggleFavorite: [];
}>();
</script>

<template>
  <div
    class="flex items-center gap-1 rounded-md"
    :class="active ? 'bg-muted' : ''"
  >
    <button
      type="button"
      class="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-1.5 text-left text-sm"
      :data-testid="TEST_ID.globalSearchResult"
      :data-active="active ? 'true' : undefined"
      @click="$emit('select')"
    >
      <span class="w-full truncate font-medium">{{ item.label }}</span>
      <span
        v-if="item.description"
        class="w-full truncate text-xs text-muted-foreground"
      >
        {{ item.description }}
      </span>
    </button>
    <button
      type="button"
      class="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
      :aria-label="
        favorite
          ? `Remove ${item.label} from favorites`
          : `Add ${item.label} to favorites`
      "
      :data-testid="TEST_ID.searchFavoriteToggle"
      @click.stop="$emit('toggleFavorite')"
    >
      <Star
        class="h-4 w-4"
        :class="favorite ? 'fill-current text-status-warning' : ''"
      />
    </button>
  </div>
</template>
