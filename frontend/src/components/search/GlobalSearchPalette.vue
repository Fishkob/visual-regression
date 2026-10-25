<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { Search } from "@lucide/vue";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import GlobalSearchResultRow from "@/components/search/GlobalSearchResultRow.vue";
import { useGlobalSearch } from "@/composables/useGlobalSearch";
import { useGlobalSearchPalette } from "@/composables/useGlobalSearchPalette";
import {
  isFavorite,
  rememberRecent,
  searchResultItems,
  toggleFavorite,
  type SearchResultItem,
} from "@/domains/search/search.model";
import {
  clearRecentSearches,
  readFavoriteSearches,
  readRecentSearches,
  writeFavoriteSearches,
  writeRecentSearches,
} from "@/domains/search/search-storage";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();
const { open, openPalette, closePalette } = useGlobalSearchPalette();
const router = useRouter();
const route = useRoute();

const query = ref("");
const normalizedQuery = computed(() => query.value.trim());

const { data, isLoading, error } = useGlobalSearch(normalizedQuery, open);

const favorites = ref<SearchResultItem[]>([]);
const recents = ref<SearchResultItem[]>([]);

onMounted(() => {
  favorites.value = readFavoriteSearches();
  recents.value = readRecentSearches();
});

const flatItems = computed(() =>
  data.value ? searchResultItems(data.value) : [],
);
const projectItems = computed(() =>
  flatItems.value.slice(0, data.value?.projects.length ?? 0),
);
const testItems = computed(() =>
  flatItems.value.slice(
    projectItems.value.length,
    projectItems.value.length + (data.value?.tests.length ?? 0),
  ),
);
const branchItems = computed(() =>
  flatItems.value.slice(projectItems.value.length + testItems.value.length),
);

// With an empty query the palette shows favorites then recents; keyboard
// selection walks the same concatenated order it renders.
const secondaryItems = computed(() => [...favorites.value, ...recents.value]);
const activeItems = computed(() =>
  normalizedQuery.value ? flatItems.value : secondaryItems.value,
);

const activeIndex = ref(0);
watch(activeItems, (items) => {
  if (activeIndex.value >= items.length) activeIndex.value = 0;
});
watch(normalizedQuery, () => {
  activeIndex.value = 0;
});

const inputRef = ref<HTMLInputElement | null>(null);

function triggerElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-testid="${TEST_ID.searchTrigger}"]`,
  );
}

watch(open, async (isOpen, wasOpen) => {
  if (isOpen) {
    query.value = "";
    activeIndex.value = 0;
    await nextTick();
    inputRef.value?.focus();
    return;
  }
  if (wasOpen) {
    // Escape/selection both end here; the header button is the documented
    // landing spot for focus.
    await nextTick();
    triggerElement()?.focus();
  }
});

function openStateChange(value: boolean): void {
  if (value) openPalette();
  else closePalette();
}

function select(item: SearchResultItem): void {
  recents.value = rememberRecent(recents.value, item);
  writeRecentSearches(recents.value);
  closePalette();
  void router.push(item.path);
}

function favoriteItem(item: SearchResultItem): void {
  favorites.value = toggleFavorite(favorites.value, item);
  writeFavoriteSearches(favorites.value);
}

function isItemFavorite(item: SearchResultItem): boolean {
  return isFavorite(favorites.value, item.id);
}

function clearRecents(): void {
  recents.value = [];
  clearRecentSearches();
}

function move(delta: number): void {
  const count = activeItems.value.length;
  if (count === 0) return;
  activeIndex.value = (activeIndex.value + delta + count) % count;
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1);
    return;
  }
  if (event.key === "Enter") {
    const item = activeItems.value[activeIndex.value];
    if (!item) return;
    event.preventDefault();
    select(item);
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable
  );
}

function onWindowKeydown(event: KeyboardEvent): void {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || event.key.toLowerCase() !== "k") return;
  // While the palette is open the shortcut toggles it even from the input; when
  // it is closed, typing a "k" into a form must stay a "k".
  if (!open.value && isTypingTarget(event.target)) return;
  event.preventDefault();
  if (open.value) closePalette();
  else openPalette();
}

onMounted(() => {
  window.addEventListener("keydown", onWindowKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onWindowKeydown);
});

// A palette opened from one page must not survive navigating to another.
watch(
  () => route.fullPath,
  () => {
    if (open.value) closePalette();
  },
);
</script>

<template>
  <DialogRoot :open="open" @update:open="openStateChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed top-[15%] left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 gap-0 overflow-hidden rounded-xl border bg-background shadow-lg"
        :data-testid="TEST_ID.globalSearchDialog"
      >
        <DialogTitle class="sr-only">{{ t("search.title") }}</DialogTitle>
        <DialogDescription class="sr-only">
          {{ t("search.description") }}
        </DialogDescription>

        <div class="flex items-center gap-2 border-b px-3 py-2">
          <Search class="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            role="combobox"
            :aria-label="t('search.inputLabel')"
            aria-autocomplete="list"
            :aria-expanded="flatItems.length > 0"
            :placeholder="t('search.placeholder')"
            class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            :data-testid="TEST_ID.globalSearchInput"
            @keydown="onInputKeydown"
          />
          <kbd
            class="hidden shrink-0 rounded border px-1 text-[10px] text-muted-foreground sm:inline"
          >
            {{ t("search.esc") }}
          </kbd>
        </div>

        <div class="max-h-96 overflow-y-auto p-2">
          <template v-if="normalizedQuery">
            <p
              v-if="isLoading && flatItems.length === 0"
              class="px-2 py-6 text-center text-sm text-muted-foreground"
              :data-testid="TEST_ID.globalSearchLoading"
            >
              {{ t("search.searching") }}
            </p>

            <p
              v-if="error"
              class="px-2 py-4 text-sm text-destructive"
              :data-testid="TEST_ID.globalSearchError"
            >
              {{ error.message }}
            </p>

            <template v-if="flatItems.length > 0">
              <section v-if="projectItems.length > 0" class="space-y-0.5">
                <h3
                  class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {{ t("search.projects") }}
                </h3>
                <GlobalSearchResultRow
                  v-for="(item, index) in projectItems"
                  :key="item.id"
                  :item="item"
                  :active="activeIndex === index"
                  :favorite="isItemFavorite(item)"
                  @select="select(item)"
                  @toggle-favorite="favoriteItem(item)"
                />
              </section>

              <section v-if="testItems.length > 0" class="mt-2 space-y-0.5">
                <h3
                  class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {{ t("search.tests") }}
                </h3>
                <GlobalSearchResultRow
                  v-for="(item, index) in testItems"
                  :key="item.id"
                  :item="item"
                  :active="activeIndex === projectItems.length + index"
                  :favorite="isItemFavorite(item)"
                  @select="select(item)"
                  @toggle-favorite="favoriteItem(item)"
                />
              </section>

              <section v-if="branchItems.length > 0" class="mt-2 space-y-0.5">
                <h3
                  class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase"
                >
                  {{ t("search.branches") }}
                </h3>
                <GlobalSearchResultRow
                  v-for="(item, index) in branchItems"
                  :key="item.id"
                  :item="item"
                  :active="
                    activeIndex ===
                    projectItems.length + testItems.length + index
                  "
                  :favorite="isItemFavorite(item)"
                  @select="select(item)"
                  @toggle-favorite="favoriteItem(item)"
                />
              </section>
            </template>

            <p
              v-else-if="!isLoading && !error"
              class="px-2 py-6 text-center text-sm text-muted-foreground"
              :data-testid="TEST_ID.globalSearchEmpty"
            >
              {{ t("search.noMatches", { query: normalizedQuery }) }}
            </p>
          </template>

          <template v-else>
            <section
              v-if="favorites.length > 0"
              class="space-y-0.5"
              :data-testid="TEST_ID.globalSearchFavorites"
            >
              <h3
                class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase"
              >
                {{ t("search.favorites") }}
              </h3>
              <GlobalSearchResultRow
                v-for="(item, index) in favorites"
                :key="item.id"
                :item="item"
                :active="activeIndex === index"
                :favorite="isItemFavorite(item)"
                @select="select(item)"
                @toggle-favorite="favoriteItem(item)"
              />
            </section>

            <section
              v-if="recents.length > 0"
              class="mt-2 space-y-0.5"
              :data-testid="TEST_ID.globalSearchRecent"
            >
              <div class="flex items-center justify-between px-2 py-1">
                <h3
                  class="text-xs font-semibold text-muted-foreground uppercase"
                >
                  {{ t("search.recent") }}
                </h3>
                <button
                  type="button"
                  class="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  :data-testid="TEST_ID.globalSearchRecentClear"
                  @click="clearRecents"
                >
                  {{ t("search.clear") }}
                </button>
              </div>
              <GlobalSearchResultRow
                v-for="(item, index) in recents"
                :key="item.id"
                :item="item"
                :active="activeIndex === favorites.length + index"
                :favorite="isItemFavorite(item)"
                @select="select(item)"
                @toggle-favorite="favoriteItem(item)"
              />
            </section>

            <p
              v-if="favorites.length === 0 && recents.length === 0"
              class="px-2 py-6 text-center text-sm text-muted-foreground"
            >
              {{ t("search.hint") }}
            </p>
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
