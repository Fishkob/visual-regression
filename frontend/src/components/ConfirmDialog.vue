<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
import { Input } from "@/components/ui/input";
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

  /**
   * Optional: when set, the confirm button stays disabled until the user types
   * this text verbatim. For an irreversible action whose blast radius the
   * dialog copy cannot carry on its own (deleting N tests at once), the click
   * alone is too cheap a gesture.
   */
  requiredText?: string;

  /** Optional: prompt above the input, naming what has to be typed. */
  requiredTextLabel?: string;
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

// The typed confirmation is per opening, not per component instance: the same
// dialog is reopened for a different selection, and a leftover match from the
// last time would defeat the guard.
const typedText = ref("");
watch(
  () => [props.open, props.requiredText] as const,
  () => {
    typedText.value = "";
  },
);
const requiresTyping = computed(() => Boolean(props.requiredText));
const confirmDisabled = computed(
  () =>
    Boolean(props.pending) ||
    (requiresTyping.value && typedText.value !== props.requiredText),
);
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

      <label v-if="requiresTyping" class="flex flex-col gap-1.5 text-sm">
        <span class="text-muted-foreground">{{ requiredTextLabel }}</span>
        <Input
          v-model="typedText"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :data-testid="TEST_ID.dialogRequiredText"
        />
      </label>

      <AlertDialogFooter>
        <AlertDialogCancel type="button" :disabled="pending" @click="onCancel">
          {{ cancelLabel }}
        </AlertDialogCancel>

        <AlertDialogAction
          type="button"
          :disabled="confirmDisabled"
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
