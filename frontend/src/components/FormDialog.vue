<script setup lang="ts">
import { computed } from "vue";
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
    pending?: boolean;
    submitDisabled?: boolean;
  }>(),
  {
    description: "",
    confirmText: "Save",
    cancelText: "Cancel",
    confirmTestId: undefined,
    pending: false,
    submitDisabled: false,
  },
);

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
        class="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">{{ title }}</DialogTitle>
          <DialogDescription
            v-if="description"
            class="text-sm text-muted-foreground"
          >
            {{ description }}
          </DialogDescription>
        </div>

        <form class="space-y-4" @submit.prevent="emit('submit')">
          <slot />

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose as-child>
              <Button
                type="button"
                variant="outline"
                :disabled="pending"
                @click="emit('cancel')"
              >
                {{ cancelText }}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              :disabled="pending || submitDisabled"
              :data-testid="confirmTestId"
            >
              {{ pending ? "Saving…" : confirmText }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
