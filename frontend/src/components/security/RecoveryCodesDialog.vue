<script setup lang="ts">
import { ref, watch } from "vue";
import { Check, Copy } from "@lucide/vue";
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

const props = defineProps<{
  open: boolean;
  codes: string[];
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const copied = ref(false);

watch(
  () => props.open,
  () => {
    copied.value = false;
  },
);

async function copy() {
  // Clipboard access can be denied (insecure origin, missing permission); the
  // codes stay selectable in the list, so the copy is a convenience only.
  await navigator.clipboard?.writeText(props.codes.join("\n"));
  copied.value = true;
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
        :data-testid="TEST_ID.recoveryCodes"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">
            Recovery codes
          </DialogTitle>
          <DialogDescription class="text-sm text-destructive">
            Store these now. They are shown once, each works once, and they are
            the only way into your account if you lose the authenticator app.
          </DialogDescription>
        </div>

        <ul class="grid grid-cols-2 gap-2 font-mono text-sm">
          <li
            v-for="code in codes"
            :key="code"
            class="rounded-md border bg-muted px-2 py-1 text-center select-all"
          >
            {{ code }}
          </li>
        </ul>

        <div class="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            :data-testid="TEST_ID.recoveryCodesCopy"
            :aria-label="
              copied ? 'Recovery codes copied' : 'Copy recovery codes'
            "
            @click="copy"
          >
            <Check v-if="copied" class="h-4 w-4" />
            <Copy v-else class="h-4 w-4" />
            <span>{{ copied ? "Copied" : "Copy codes" }}</span>
          </Button>
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.recoveryCodesDone">
              Done
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
