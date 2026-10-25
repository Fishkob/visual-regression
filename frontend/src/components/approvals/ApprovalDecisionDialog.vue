<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPROVAL_NOTE_MAX_LENGTH,
  APPROVAL_REASONS,
  type ApprovalDecision,
  type ApprovalReason,
} from "@/domains/approvals/approval-reason";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm", decision: ApprovalDecision): void;
}>();

const { t } = useI18n();
const reason = ref("none");
const note = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    reason.value = "none";
    note.value = "";
  },
);

const trimmedNote = computed(() => note.value.trim());
const tooLong = computed(
  () => trimmedNote.value.length > APPROVAL_NOTE_MAX_LENGTH,
);

function submit() {
  if (tooLong.value) return;
  const decision: ApprovalDecision = {
    ...(reason.value === "none"
      ? {}
      : { reason: reason.value as ApprovalReason }),
    ...(trimmedNote.value ? { note: trimmedNote.value } : {}),
  };
  emit("confirm", decision);
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('approval.decisionTitle')"
    :description="t('approval.decisionDescription')"
    :confirm-text="t('approveSkipFooter.approve')"
    :submit-disabled="tooLong"
    :confirm-test-id="TEST_ID.approveConfirm"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div class="space-y-3">
      <label class="block space-y-1 text-sm">
        <span>{{ t("approval.reasonField") }}</span>
        <Select v-model="reason">
          <SelectTrigger :data-testid="TEST_ID.approveReason">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{{ t("approval.noReason") }}</SelectItem>
            <SelectItem
              v-for="option in APPROVAL_REASONS"
              :key="option"
              :value="option"
            >
              {{ t(`approval.reason.${option}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label class="block space-y-1 text-sm">
        <span>{{ t("approval.noteField") }}</span>
        <textarea
          v-model="note"
          rows="3"
          :maxlength="APPROVAL_NOTE_MAX_LENGTH"
          :placeholder="t('approval.notePlaceholder')"
          class="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          :aria-invalid="tooLong"
          :data-testid="TEST_ID.approveNote"
        />
        <span class="block text-right text-xs text-muted-foreground">
          {{ t("approval.noteCounter", { count: trimmedNote.length }) }}
        </span>
      </label>

      <p v-if="tooLong" class="text-sm text-destructive" role="alert">
        {{ t("approval.noteTooLong") }}
      </p>
    </div>
  </FormDialog>
</template>
