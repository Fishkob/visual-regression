<script setup lang="ts">
import { computed, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import UserAvatar from "@/components/UserAvatar.vue";
import AsyncState from "@/components/AsyncState.vue";
import { useTestApprovalsQuery } from "@/composables/useTestApprovals";
import { approvalReasonKey } from "@/domains/approvals/approval-reason";
import type { Approval } from "@/domains/approvals/approval.model";
import { currentLocale } from "@/i18n";
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  projectName: string;
  testName: string;
  branch?: string;
}>();

// Content only: the rail owns the header and its tab, and gets the size so the
// tab can carry the count.
const emit = defineEmits<{
  "update:count": [count: number];
}>();

const { t } = useI18n();

const {
  data: approvals,
  isLoading,
  error,
  refetch,
} = useTestApprovalsQuery(
  toRef(props, "projectName"),
  toRef(props, "testName"),
  toRef(props, "branch"),
);

const rows = computed(() => approvals.value ?? []);

watch(rows, (list) => emit("update:count", list.length), { immediate: true });

// The accepted mismatch is the fact the row exists for: it says how much change
// this approval let through. Grouping keeps a six-digit count readable.
function acceptedMismatch(count: number): string {
  return new Intl.NumberFormat(currentLocale()).format(count);
}

function mismatchLabel(approval: Approval): string | null {
  const count = approval.mismatchPixelCount;
  if (count == null || count <= 0) return null;
  return t("approval.acceptedMismatch", { count: acceptedMismatch(count) });
}
</script>

<template>
  <AsyncState
    :is-loading="isLoading"
    :error="error"
    :error-title="t('approval.historyLoadError')"
    :retry="refetch"
    :empty="rows.length === 0"
    :empty-title="t('approval.historyEmpty')"
  >
    <template #loading>
      <div class="space-y-3 px-4 py-3" role="status" aria-live="polite">
        <div
          v-for="row in 2"
          :key="row"
          class="h-14 animate-pulse rounded-md bg-muted"
        />
        <span class="sr-only">{{ t("common.loading") }}</span>
      </div>
    </template>

    <ul class="divide-y px-4" :data-testid="TEST_ID.approvalHistoryList">
      <li
        v-for="approval in rows"
        :key="approval.id"
        class="flex gap-3 py-3"
        :data-testid="TEST_ID.approvalHistoryRow"
      >
        <UserAvatar :name="approval.approvedBy" size="sm" />

        <div class="min-w-0 flex-1">
          <p class="text-xs">
            <span class="font-medium">{{ approval.approvedBy }}</span>
            <span class="ml-1 text-muted-foreground">
              {{ t("approval.approvedLabel") }}
            </span>
          </p>

          <p
            class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground"
          >
            <span :title="formatDateTime(approval.approvedAt)">
              {{ formatRelativeAge(approval.approvedAt.toISOString()) }}
            </span>
            <template v-if="mismatchLabel(approval)">
              <span aria-hidden="true">·</span>
              <span :data-testid="TEST_ID.approvalAcceptedMismatch">
                {{ mismatchLabel(approval) }}
              </span>
            </template>
          </p>

          <Badge
            v-if="approval.reason"
            variant="outline"
            class="mt-1.5 text-[10px]"
            :data-testid="TEST_ID.approvalReason"
          >
            {{ t(approvalReasonKey(approval.reason)) }}
          </Badge>

          <blockquote
            v-if="approval.note"
            class="mt-1.5 border-l-2 border-border pl-2 text-xs text-muted-foreground"
            :data-testid="TEST_ID.approvalNote"
          >
            {{ approval.note }}
          </blockquote>
        </div>
      </li>
    </ul>
  </AsyncState>
</template>
