<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;

  title?: string;
  description?: string;

  confirmText?: string;
  cancelText?: string;

  /** Optional: disable buttons while something is pending */
  pending?: boolean;

  /** Optional: confirm button variant styling */
  confirmVariant?: "default" | "destructive";
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const modelOpen = computed({
  get: () => props.open,
  set: (val: boolean) => emit("update:open", val),
});

function close() {
  modelOpen.value = false;
}

function onCancel() {
  emit("cancel");
  close();
}

function onConfirm() {
  emit("confirm");
  // Close by default to match existing call-site expectations.
  // Can be made configurable later if needed.
  close();
}

const confirmBtnClass = computed(() => {
  if (props.confirmVariant === "destructive") {
    return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
  }
  return "";
});

const confirmLabel = computed(() => props.confirmText ?? t("common.confirm"));
const cancelLabel = computed(() => props.cancelText ?? t("common.cancel"));
const titleText = computed(() => props.title ?? t("confirmDialog.title"));
</script>

<template>
  <AlertDialog v-model:open="modelOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle :data-testid="TEST_ID.dialogTitle">
          <slot name="title">
            {{ titleText }}
          </slot>
        </AlertDialogTitle>

        <AlertDialogDescription :data-testid="TEST_ID.dialogDescription">
          <slot name="description">
            {{ description ?? "" }}
          </slot>
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <AlertDialogCancel type="button" :disabled="pending" @click="onCancel">
          {{ cancelLabel }}
        </AlertDialogCancel>

        <AlertDialogAction
          type="button"
          :disabled="pending"
          :class="confirmBtnClass"
          @click="onConfirm"
          :data-testid="TEST_ID.dialogConfirm"
        >
          {{ confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
