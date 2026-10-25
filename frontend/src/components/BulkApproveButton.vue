<script setup lang="ts">
import { ref, toRef } from "vue";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { useBulkApprove } from "@/composables/useBulkApprove";
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

function confirm() {
  mutate();
}
</script>

<template>
  <Button
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
    v-model:open="open"
    title="Approve all pending variants?"
    description="Every pending change of this test on this branch becomes the new baseline. This cannot be undone."
    confirm-text="Approve all"
    :pending="isPending"
    @confirm="confirm"
  />
</template>
