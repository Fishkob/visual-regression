<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ApprovalHistoryPanel from "@/components/detail-panels/ApprovalHistoryPanel.vue";
import BaselineHistoryPanel from "@/components/detail-panels/BaselineHistoryPanel.vue";
import CommentsPanel from "@/components/comments/CommentsPanel.vue";
import { cn } from "@/lib/utils";
import { TEST_ID } from "@/lib/test-ids";
import type { VariantParams } from "@/lib/variant-key";

type TabKey = "comments" | "history" | "approvals";

// The review's three trailing sections — discussion, baseline trail, approval
// trail — as one tabbed block below the comparison. The picture keeps the full
// width, an empty section costs a tab instead of half a screen, and the tab
// counts say what is waiting in the sections that are not shown.
const props = withDefaults(
  defineProps<{
    projectName: string;
    testName: string;
    branch?: string;
    comparisonId?: string;
    readOnly?: boolean;
    // History reads and restores have their own read-only case: a baseline that
    // still follows another branch is restorable nowhere near this page.
    historyReadOnly?: boolean;
    variant?: VariantParams;
    currentHash?: string;
    kind?: "image" | "pdf";
    // An inherited test has no history on this branch (the read answers 409),
    // so the tab is not offered at all.
    historyEnabled?: boolean;
  }>(),
  { kind: "image", historyEnabled: true },
);

const { t } = useI18n();

// Each panel owns its query and reports its size; the tab carries the count.
// Panels stay mounted while their tab is hidden, so a count never goes stale
// and switching tabs does not refetch.
const counts = reactive<Record<TabKey, number>>({
  comments: 0,
  history: 0,
  approvals: 0,
});

// The thread is paged, so a full page only tells us there *may* be older
// comments; the tab then says "at least N" instead of pretending the loaded
// page is the whole discussion.
const commentsHaveOlder = ref(false);

function tabCount(key: TabKey): string {
  const count = counts[key];
  return key === "comments" && commentsHaveOlder.value
    ? `${count}+`
    : `${count}`;
}

const active = ref<TabKey>("comments");
const userPicked = ref(false);

// Without a resolved variant there is nothing to scope a history read to, so
// the tab only exists when the caller could resolve one.
const showHistory = computed(() => props.historyEnabled && !!props.variant);

const tabs = computed(() =>
  (
    [
      {
        key: "comments",
        label: t("comments.title"),
        testId: TEST_ID.activityTabComments,
      },
      {
        key: "history",
        label: t("baseline.tab"),
        testId: TEST_ID.activityTabHistory,
      },
      {
        key: "approvals",
        label: t("approval.tab"),
        testId: TEST_ID.activityTabApprovals,
      },
    ] satisfies { key: TabKey; label: string; testId: string }[]
  ).filter((tab) => tab.key !== "history" || showHistory.value),
);

// Open on the section that has something to show: a reviewer landing on a
// discussion wants the discussion, not an empty one. A reload that answers
// empty leaves the tab alone, and a click always wins.
watch(
  counts,
  () => {
    if (userPicked.value) return;
    if (counts.comments > 0) active.value = "comments";
    else if (counts.history > 0 && showHistory.value) active.value = "history";
    else if (counts.approvals > 0) active.value = "approvals";
  },
  { immediate: true, deep: true },
);

function select(key: TabKey) {
  userPicked.value = true;
  active.value = key;
}

// Arrow keys move between tabs (roving tabindex, as the ARIA tabs pattern
// expects); Home/End jump to the ends.
function onKeydown(event: KeyboardEvent) {
  const keys = tabs.value.map((tab) => tab.key);
  const current = keys.indexOf(active.value);
  if (current < 0) return;
  const last = keys.length - 1;
  let next: number | null = null;
  if (event.key === "ArrowRight") next = current === last ? 0 : current + 1;
  else if (event.key === "ArrowLeft") next = current === 0 ? last : current - 1;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = last;
  if (next == null) return;
  event.preventDefault();
  select(keys[next]!);
  const target = document.getElementById(
    `${TEST_ID.activityRail}-tab-${keys[next]}`,
  );
  target?.focus();
}
</script>

<template>
  <section
    class="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
    :data-testid="TEST_ID.activityRail"
  >
    <div
      role="tablist"
      :aria-label="t('detail.activityLabel')"
      class="flex shrink-0 items-center gap-1 border-b bg-muted/40 p-1.5"
      @keydown="onKeydown"
    >
      <button
        v-for="tab in tabs"
        :id="`${TEST_ID.activityRail}-tab-${tab.key}`"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="active === tab.key"
        :aria-controls="`${TEST_ID.activityRail}-panel-${tab.key}`"
        :tabindex="active === tab.key ? 0 : -1"
        :data-testid="tab.testId"
        :class="
          cn(
            'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            active === tab.key
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )
        "
        @click="select(tab.key)"
      >
        {{ tab.label }}
        <span
          class="px-1 text-[10px] tabular-nums"
          :class="
            active === tab.key ? 'text-foreground' : 'text-muted-foreground'
          "
          :data-testid="TEST_ID.activityTabCount"
        >
          {{ tabCount(tab.key) }}
        </span>
      </button>
    </div>

    <div
      v-show="active === 'comments'"
      :id="`${TEST_ID.activityRail}-panel-comments`"
      role="tabpanel"
      :aria-labelledby="`${TEST_ID.activityRail}-tab-comments`"
      class="flex max-h-[28rem] min-h-0 flex-1 flex-col overflow-hidden"
    >
      <CommentsPanel
        :project-name="projectName"
        :test-name="testName"
        :branch="branch"
        :comparison-id="comparisonId"
        :read-only="readOnly"
        @update:count="counts.comments = $event"
        @update:has-older="commentsHaveOlder = $event"
      />
    </div>

    <div
      v-if="showHistory && variant"
      v-show="active === 'history'"
      :id="`${TEST_ID.activityRail}-panel-history`"
      role="tabpanel"
      :aria-labelledby="`${TEST_ID.activityRail}-tab-history`"
      class="max-h-[28rem] min-h-0 flex-1 overflow-y-auto"
    >
      <BaselineHistoryPanel
        :project-name="projectName"
        :test-name="testName"
        :branch="branch"
        :variant="variant"
        :current-hash="currentHash"
        :kind="kind"
        :read-only="historyReadOnly ?? readOnly"
        @update:count="counts.history = $event"
      />
    </div>

    <div
      v-show="active === 'approvals'"
      :id="`${TEST_ID.activityRail}-panel-approvals`"
      role="tabpanel"
      :aria-labelledby="`${TEST_ID.activityRail}-tab-approvals`"
      class="max-h-[28rem] min-h-0 flex-1 overflow-y-auto"
    >
      <ApprovalHistoryPanel
        :project-name="projectName"
        :test-name="testName"
        :branch="branch"
        @update:count="counts.approvals = $event"
      />
    </div>
  </section>
</template>
