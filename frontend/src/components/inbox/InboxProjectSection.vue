<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeAge } from "@/lib/format-date";
import { formatVariantLabel } from "@/lib/format-variant-label";
import type { InboxProjectSection } from "@/domains/pending-tests/group-review-inbox";
import type { ReviewInboxItem } from "@/domains/pending-tests/review-inbox.model";
import { TEST_ID } from "@/lib/test-ids";

const props = withDefaults(
  defineProps<{
    section: InboxProjectSection;
    // Multi-select is a writer action: a VIEWER gets no checkboxes at all.
    selectable?: boolean;
    selectedIds?: string[];
  }>(),
  { selectable: false, selectedIds: () => [] },
);

const emit = defineEmits<{
  toggle: [comparisonId: string];
}>();

const router = useRouter();
const route = useRoute();
const { t } = useI18n();

function isSelected(comparisonId: string): boolean {
  return props.selectedIds.includes(comparisonId);
}

// The review pass is branch-scoped (the details page's pending list is), so the
// count must describe the set it will walk: the project's pending items on the
// branch the pass starts on. The server sends that count with every row, so
// paginating the inbox cannot shrink "Review N"; the page-local fallback only
// covers payloads that predate the field.
//
// "My reviews" is part of the pass's scope too: it narrows the pending list the
// details page walks, so the count below describes the assigned subset.
const assignedToMe = computed(() => route.query.assignedToMe === "1");

const reviewStart = computed<ReviewInboxItem | undefined>(
  () => props.section.items[0],
);
const reviewTotal = computed(() => {
  const start = reviewStart.value;
  if (!start) return 0;
  const onBranch = props.section.items.filter(
    (item) => item.branchName === start.branchName,
  ).length;
  // projectPendingCount describes every pending comparison of the branch, which
  // is the set an unfiltered pass walks. With "My reviews" on the pass walks the
  // assigned subset instead, and the payload carries no assigned count — the
  // section's own (server-filtered) rows are the only honest source.
  if (assignedToMe.value) return onBranch;
  return start.projectPendingCount ?? onBranch;
});
const reviewChangeCount = computed(() =>
  t("inbox.reviewCount", reviewTotal.value),
);
// Only name the branch when the project spans several — a single-branch project
// needs no qualifier.
const reviewScopeLabel = computed(() => {
  const start = reviewStart.value;
  if (!start || (start.projectBranchCount ?? 1) <= 1) return "";
  return t("inbox.reviewScope", { branch: start.branchName });
});

// The default branch needs no query parameter (same convention as the project
// switcher): an item on it returns to the unfiltered inbox, while a branch-scoped
// item keeps `?branch=` through the whole pass — including the "back" leg.
function branchQuery(item: ReviewInboxItem) {
  return item.isDefaultBranch ? {} : { branch: item.branchName };
}

// The kind/group filters are the rest of the pass's scope: they ride along as
// `inboxKind`/`inboxGroup` so the "back to inbox" leg can restore the filtered
// queue instead of widening it to every pending change. "My reviews" keeps its
// own key on both routes.
function inboxScopeQuery() {
  const scope: Record<string, string> = {};
  const { kind, group } = route.query;
  if (typeof kind === "string" && kind) scope.inboxKind = kind;
  if (typeof group === "string" && group) scope.inboxGroup = group;
  if (assignedToMe.value) scope.assignedToMe = "1";
  return scope;
}

function openItem(item: ReviewInboxItem) {
  void router.push({
    name: "test-detail",
    params: { projectName: item.projectName, testName: item.testName },
    query: {
      viewport: item.viewport,
      browser: item.browser,
      environment: item.environment,
      ...branchQuery(item),
      ...inboxScopeQuery(),
      from: "inbox",
    },
  });
}

function startProjectReview() {
  const first = reviewStart.value;
  if (!first) return;
  void router.push({
    name: "test-detail",
    params: { projectName: first.projectName, testName: first.testName },
    query: {
      viewport: first.viewport,
      browser: first.browser,
      environment: first.environment,
      ...branchQuery(first),
      ...inboxScopeQuery(),
    },
  });
}
</script>

<template>
  <section
    class="space-y-2"
    :aria-label="section.projectName"
    :data-testid="TEST_ID.inboxProjectSection"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <h3 class="font-semibold">{{ section.projectName }}</h3>
        <p class="text-xs text-muted-foreground">
          {{ reviewChangeCount }}{{ reviewScopeLabel }}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :aria-label="
          t('inbox.reviewAria', {
            count: reviewTotal,
            scope: reviewScopeLabel,
            project: section.projectName,
          })
        "
        :data-testid="TEST_ID.reviewProjectButton"
        @click="startProjectReview"
      >
        {{
          t("inbox.reviewButton", {
            count: reviewTotal,
            scope: reviewScopeLabel,
          })
        }}
      </Button>
    </div>

    <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div
        v-for="item in section.items"
        :key="item.comparisonId"
        class="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
      >
        <input
          v-if="selectable"
          type="checkbox"
          class="h-4 w-4 shrink-0"
          :checked="isSelected(item.comparisonId)"
          :aria-label="
            t('inbox.ariaSelect', {
              test: item.testName,
              project: section.projectName,
            })
          "
          :data-testid="TEST_ID.inboxSelectRow"
          @change="emit('toggle', item.comparisonId)"
        />
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center justify-between gap-4 text-left transition-colors hover:bg-muted/50"
          :data-testid="TEST_ID.inboxItem"
          @click="openItem(item)"
        >
          <div class="min-w-0">
            <p class="truncate font-medium">{{ item.testName }}</p>
            <p class="text-xs text-muted-foreground">
              {{ formatVariantLabel(item) || t("inbox.noVariant") }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Badge
              v-if="!item.isDefaultBranch"
              variant="secondary"
              class="font-mono text-[10px]"
              :data-testid="TEST_ID.inboxBranchBadge"
            >
              {{ item.branchName }}
            </Badge>
            <Badge
              v-if="item.runKey"
              variant="outline"
              class="font-mono text-[10px]"
              :title="t('inbox.runTitle', { runKey: item.runKey })"
              :data-testid="TEST_ID.inboxRunBadge"
            >
              {{ item.runKey }}
            </Badge>
            <Badge variant="outline">{{
              item.kind === "pdf" ? t("inbox.pdf") : t("inbox.image")
            }}</Badge>
            <Badge variant="destructive">
              {{
                item.kind === "pdf"
                  ? t("inbox.mismatchPages", {
                      count: item.mismatchPageCount ?? 0,
                    })
                  : t("inbox.mismatchPixels", {
                      count: item.mismatchPixelCount,
                    })
              }}
            </Badge>
            <span class="text-xs text-muted-foreground">{{
              formatRelativeAge(item.createdAt)
            }}</span>
          </div>
        </button>
      </div>
    </div>
  </section>
</template>
