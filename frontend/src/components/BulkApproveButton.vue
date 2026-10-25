<script setup lang="ts">
import { ref, toRef } from "vue";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { useBulkApprove } from "@/composables/useBulkApprove";
import { useCurrentRole } from "@/composables/useAuth";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  projectName: string;
  testName: string;
  branch?: string;
  disabled?: boolean;
}>();

const open = ref(false);
const { mutate, isPending } = useBulkApprove(
  toRef(props, "projectName"),
  toRef(props, "testName"),
  toRef(props, "branch"),
);

// A batch approval is a write: a VIEWER gets no trigger at all, not a disabled
// one (a disabled control would advertise an action the role can never use).
const { canWrite } = useCurrentRole();

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
    Approve all pending
  </Button>

  <ConfirmDialog
    v-if="canWrite"
    v-model:open="open"
    title="Approve all pending variants?"
    description="Every pending change of this test on this branch becomes the new baseline. This cannot be undone."
    confirm-text="Approve all"
    :pending="isPending"
    @confirm="confirm"
  />
</template>
