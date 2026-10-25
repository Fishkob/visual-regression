<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { formatDateTime } from "@/lib/format-date";
import { useTestApprovalsQuery } from "@/composables/useTestApprovals";
import { formatRelativeAge } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { approvalReasonKey } from "@/domains/approvals/approval-reason";
import { TEST_ID } from "@/lib/test-ids";
import type { VariantParams } from "@/lib/variant-key";

const { t } = useI18n();

const props = defineProps<{
  projectName: string;
  testName: string;
  branch?: string;
  variant?: VariantParams;
}>();

// A missing or failed history is not an error state for the review header: the
// query renders nothing while loading and nothing on error, so the header keeps
// its shape either way.
const { data: approvals } = useTestApprovalsQuery(
  toRef(props, "projectName"),
  toRef(props, "testName"),
  toRef(props, "branch"),
);

// The trail is test-scoped and newest-first. The header shows one variant on
// one branch, so pick the newest approval of THAT pair: the newest approval of
// the test may belong to a sibling variant or to a feature branch. The default
// branch is the one without a `branch` query, which is also how the approval
// POST records it (`branchName` absent).
const newest = computed(() => {
  const all = approvals.value ?? [];
  const variant = props.variant;
  return all.find((approval) => {
    const branchMatches = props.branch
      ? approval.branchName === props.branch
      : !approval.branchName;
    if (!branchMatches) return false;
    if (!variant) return true;
    return (
      (!variant.viewport || approval.variant.viewport === variant.viewport) &&
      (!variant.browser || approval.variant.browser === variant.browser) &&
      (!variant.environment ||
        approval.variant.environment === variant.environment)
    );
  });
});

const approvedAgo = computed(() =>
  newest.value ? formatRelativeAge(newest.value.approvedAt.toISOString()) : "",
);

const approvedAtTitle = computed(() =>
  newest.value ? formatDateTime(newest.value.approvedAt) : "",
);
</script>

<template>
  <span
    v-if="newest"
    class="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
    :title="approvedAtTitle"
    :data-testid="TEST_ID.approvalBadge"
  >
    <span>
      {{
        t("approval.approvedBy", {
          user: newest.approvedBy,
          age: approvedAgo,
        })
      }}
    </span>
    <Badge
      v-if="newest.reason"
      variant="outline"
      class="text-[10px]"
      :data-testid="TEST_ID.approvalReason"
    >
      {{ t(approvalReasonKey(newest.reason)) }}
    </Badge>
    <span
      v-if="newest.note"
      class="max-w-64 truncate"
      :title="newest.note"
      :data-testid="TEST_ID.approvalNote"
    >
      {{ t("approval.noteLabel") }} {{ newest.note }}
    </span>
  </span>
</template>
