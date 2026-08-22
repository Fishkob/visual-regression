<script setup lang="ts">
import { computed } from "vue";

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
    return "bg-destructive text-white hover:bg-destructive/90";
  }
  return "";
});

const confirmLabel = computed(() => props.confirmText ?? "Confirm");
const cancelLabel = computed(() => props.cancelText ?? "Cancel");
</script>

<template>
  <AlertDialog v-model:open="modelOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          <slot name="title">
            {{ title ?? "Confirm" }}
          </slot>
        </AlertDialogTitle>

        <AlertDialogDescription>
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
        >
          {{ confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
