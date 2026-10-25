<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { useCurrentRole } from "@/composables/useAuth";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{
  // When the comparison is already APPROVED, the skip button becomes a
  // "Back to project" affordance and the Approve button is hidden — the test
  // is done and the reviewer should navigate on. One behavior for both kinds.
  approved: boolean;
  // While an approval is in flight, both buttons are disabled so a double-click
  // cannot fire two concurrent approves (the second is a guaranteed CONFLICT).
  isApproving?: boolean;
}>();

defineEmits<{
  skip: [];
  approve: [];
}>();

// A VIEWER can still walk the queue (Skip / Back to project), but approving is
// a write the backend would reject with 403.
const { canWrite } = useCurrentRole();
const { t } = useI18n();
</script>

<template>
  <div class="flex gap-4 mt-10 w-full">
    <Button
      variant="secondary"
      class="flex-1 py-4 text-base rounded-xl"
      :data-testid="approved ? TEST_ID.backToProject : TEST_ID.skip"
      :disabled="isApproving"
      @click="$emit('skip')"
    >
      {{
        approved
          ? t("approveSkipFooter.backToProject")
          : t("approveSkipFooter.skip")
      }}
    </Button>

    <Button
      v-if="!approved && canWrite"
      class="flex-1 py-4 text-base rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
      :data-testid="TEST_ID.approveChanges"
      :disabled="isApproving"
      @click="$emit('approve')"
    >
      {{ t("approveSkipFooter.approve") }}
    </Button>
  </div>
</template>
