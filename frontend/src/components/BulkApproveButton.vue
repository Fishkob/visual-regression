<script setup lang="ts">
import { computed, ref, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { useBulkApprove } from "@/composables/useBulkApprove";
import { useCurrentRole } from "@/composables/useAuth";
import { TEST_ID } from "@/lib/test-ids";

const props = withDefaults(
  defineProps<{
    projectName: string;
    testName: string;
    branch?: string;
    disabled?: boolean;
    // The project's review policy. Above one, a batch approval only records one
    // vote per comparison, so the confirmation must not promise new baselines.
    requiredApprovals?: number;
  }>(),
  { requiredApprovals: 1 },
);

const open = ref(false);
const { mutate, isPending } = useBulkApprove(
  toRef(props, "projectName"),
  toRef(props, "testName"),
  toRef(props, "branch"),
);

// A batch approval is a write: a VIEWER gets no trigger at all, not a disabled
// one (a disabled control would advertise an action the role can never use).
const { canWrite } = useCurrentRole();
const { t } = useI18n();

const description = computed(() =>
  props.requiredApprovals > 1
    ? t("bulkApprove.descriptionMulti")
    : t("bulkApprove.description"),
);

function confirm() {
  mutate();
}
</script>

<template>
  <Button
    v-if="canWrite"
    type="button"
    variant="outline"
    size="sm"
    :disabled="disabled || isPending"
    :data-testid="TEST_ID.bulkApprove"
    @click="open = true"
  >
    {{ t("bulkApprove.trigger") }}
  </Button>

  <ConfirmDialog
    v-if="canWrite"
    v-model:open="open"
    :title="t('bulkApprove.title')"
    :description="description"
    :confirm-text="t('bulkApprove.confirm')"
    :pending="isPending"
    @confirm="confirm"
  />
</template>
