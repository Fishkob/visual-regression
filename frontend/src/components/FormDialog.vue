<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { Button } from "@/components/ui/button";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    confirmTestId?: string;
    confirmVariant?: "default" | "destructive";
    pending?: boolean;
    submitDisabled?: boolean;
  }>(),
  {
    description: "",
    confirmText: undefined,
    cancelText: undefined,
    confirmTestId: undefined,
    confirmVariant: "default",
    pending: false,
    submitDisabled: false,
  },
);

const { t } = useI18n();
const confirmLabel = computed(() => props.confirmText ?? t("common.save"));
const cancelLabel = computed(() => props.cancelText ?? t("common.cancel"));

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit"): void;
  (e: "cancel"): void;
}>();

const modelOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
</script>

<template>
  <DialogRoot v-model:open="modelOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg"
      >
        <div class="flex shrink-0 flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">{{ title }}</DialogTitle>
          <DialogDescription
            v-if="description"
            class="text-sm text-muted-foreground"
          >
            {{ description }}
          </DialogDescription>
        </div>

        <!-- A form taller than the viewport scrolls its fields, not its action
             row: Cancel and Confirm stay reachable without scrolling a dialog
             that is pinned to the window centre. -->
        <form
          class="flex min-h-0 flex-1 flex-col gap-4"
          @submit.prevent="emit('submit')"
        >
          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <slot />
          </div>

          <div
            class="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
            <DialogClose as-child>
              <Button
                type="button"
                variant="outline"
                :disabled="pending"
                @click="emit('cancel')"
              >
                {{ cancelLabel }}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              :variant="confirmVariant"
              :disabled="pending || submitDisabled"
              :data-testid="confirmTestId"
            >
              {{ pending ? t("formDialog.saving") : confirmLabel }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
