<script setup lang="ts">
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
import { TEST_ID } from "@/lib/test-ids";

defineProps<{
  open: boolean;
  password?: string;
  username?: string;
  title?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
        :data-testid="TEST_ID.temporaryPasswordDialog"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">
            {{ title ?? "Temporary password" }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            Copy this password now and hand it to the user over a secure
            channel. It is shown once and cannot be retrieved again.
          </DialogDescription>
        </div>

        <code
          class="overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm"
          :data-testid="TEST_ID.temporaryPasswordValue"
        >
          {{ password }}
        </code>

        <p v-if="username" class="text-sm text-muted-foreground">
          User: <span class="font-medium">{{ username }}</span>
        </p>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.temporaryPasswordDone">
              Done
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
