<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeAge } from "@/lib/format-date";
import { formatVariantLabel } from "@/lib/format-variant-label";
import type { InboxProjectSection } from "@/domains/pending-tests/group-review-inbox";
import type { ReviewInboxItem } from "@/domains/pending-tests/review-inbox.model";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  section: InboxProjectSection;
  /** The same project unfiltered: the pass walks this, not the filtered view. */
  projectSection?: InboxProjectSection;
}>();
const router = useRouter();

// The review pass is branch-scoped (the details page's pending list is), so the
// count must describe the set it will walk: the project's pending items on the
// branch the pass starts on. Filtering the inbox down must not shrink "Review N",
// and branching must not let it span branches the pass never visits.
const reviewItems = computed(
  () => props.projectSection?.items ?? props.section.items,
);
const reviewStart = computed<ReviewInboxItem | undefined>(
  () => reviewItems.value[0],
);
const reviewScope = computed(() => {
  const start = reviewStart.value;
  if (!start) return reviewItems.value;
  // `start` always comes from `reviewItems`, so the filtered list cannot be
  // empty; there is no "fall back to every branch" branch to get wrong.
  return reviewItems.value.filter(
    (item) => item.branchName === start.branchName,
  );
});
const reviewTotal = computed(() => reviewScope.value.length);
const reviewChangeCount = computed(
  () =>
    `${reviewTotal.value} ${reviewTotal.value === 1 ? "change" : "changes"}`,
);
// Only name the branch when the project spans several — a single-branch project
// needs no qualifier.
const reviewScopeLabel = computed(() => {
  const branches = new Set(reviewItems.value.map((item) => item.branchName));
  const branchName = reviewStart.value?.branchName;
  return branches.size > 1 && branchName ? ` on ${branchName}` : "";
});

// The default branch needs no query parameter (same convention as the project
// switcher): an item on it returns to the unfiltered inbox, while a branch-scoped
// item keeps `?branch=` through the whole pass — including the "back" leg.
function branchQuery(item: ReviewInboxItem) {
  return item.isDefaultBranch ? {} : { branch: item.branchName };
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
          {{ reviewChangeCount }} to review{{ reviewScopeLabel }}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :aria-label="`Review ${reviewChangeCount}${reviewScopeLabel} in ${section.projectName}`"
        :data-testid="TEST_ID.reviewProjectButton"
        @click="startProjectReview"
      >
        Review {{ reviewTotal
        }}<span v-if="reviewScopeLabel">{{ reviewScopeLabel }}</span>
      </Button>
    </div>

    <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        v-for="item in section.items"
        :key="item.comparisonId"
        type="button"
        class="flex w-full items-center justify-between gap-4 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50"
        :data-testid="TEST_ID.inboxItem"
        @click="openItem(item)"
      >
        <div class="min-w-0">
          <p class="truncate font-medium">{{ item.testName }}</p>
          <p class="text-xs text-muted-foreground">
            {{ formatVariantLabel(item) || "No variant" }}
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
          <Badge variant="outline">{{
            item.kind === "pdf" ? "PDF" : "Image"
          }}</Badge>
          <Badge variant="destructive">
            {{
              item.kind === "pdf"
                ? `${item.mismatchPageCount ?? 0} pages`
                : `${item.mismatchPixelCount} px`
            }}
          </Badge>
          <span class="text-xs text-muted-foreground">{{
            formatRelativeAge(item.createdAt)
          }}</span>
        </div>
      </button>
    </div>
  </section>
</template>
