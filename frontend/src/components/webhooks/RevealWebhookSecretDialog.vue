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
  url?: string;
  secret?: string;
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
  if (!props.secret) return;
  // Clipboard access can be denied (insecure origin, missing permission); the
  // secret stays selectable in the field so it can still be copied by hand.
  await navigator.clipboard?.writeText(props.secret);
  copied.value = true;
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
        :data-testid="TEST_ID.webhookSecretDialog"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">
            Signing secret
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            Copy this secret into your receiver now. It signs every request and
            is shown only once.
          </DialogDescription>
        </div>

        <div class="flex items-center gap-2">
          <code
            class="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm"
            :data-testid="TEST_ID.webhookSecretValue"
          >
            {{ secret }}
          </code>
          <Button
            type="button"
            variant="outline"
            :data-testid="TEST_ID.webhookSecretCopy"
            :aria-label="copied ? 'Secret copied' : 'Copy secret'"
            @click="copy"
          >
            <Check v-if="copied" class="h-4 w-4" />
            <Copy v-else class="h-4 w-4" />
            <span>{{ copied ? "Copied" : "Copy" }}</span>
          </Button>
        </div>

        <p v-if="url" class="text-sm text-muted-foreground">
          Endpoint: <span class="break-all font-medium">{{ url }}</span>
        </p>

        <p class="text-sm text-muted-foreground">
          Requests carry
          <code class="font-mono text-xs"
            >X-VRT-Signature: sha256=&lt;hmac&gt;</code
          >
          and <code class="font-mono text-xs">X-VRT-Timestamp</code>; verify
          them before trusting a payload.
        </p>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.webhookSecretDone">
              Done
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
