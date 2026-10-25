<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
import type { IssuedApiKey } from "@/domains/api-keys/api-key.model";

const props = defineProps<{
  open: boolean;
  issuedKey?: IssuedApiKey | null;
  title?: string;
  description?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { t } = useI18n();
const copied = ref(false);

watch(
  () => props.open,
  () => {
    copied.value = false;
  },
);

async function copy() {
  const rawKey = props.issuedKey?.rawKey;
  if (!rawKey) return;
  // The reveal is a convenience, not the only way to get the key: clipboard
  // access can be denied (insecure origin, missing permission), in which case
  // the key stays selectable in the field so it can still be copied by hand.
  await navigator.clipboard?.writeText(rawKey);
  copied.value = true;
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
        :data-testid="TEST_ID.apiKeyReveal"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">
            {{ title ?? t("apiKeyReveal.defaultTitle") }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ description ?? t("apiKeyReveal.defaultDescription") }}
          </DialogDescription>
        </div>

        <div class="flex items-center gap-2">
          <code
            class="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm"
            :data-testid="TEST_ID.apiKeyRevealValue"
          >
            {{ issuedKey?.rawKey }}
          </code>
          <Button
            type="button"
            variant="outline"
            :data-testid="TEST_ID.apiKeyCopy"
            :aria-label="
              copied ? t('apiKeyReveal.copiedAria') : t('apiKeyReveal.copyAria')
            "
            @click="copy"
          >
            <Check v-if="copied" class="h-4 w-4" />
            <Copy v-else class="h-4 w-4" />
            <span>{{
              copied ? t("apiKeyReveal.copied") : t("apiKeyReveal.copy")
            }}</span>
          </Button>
        </div>

        <p class="text-sm text-muted-foreground">
          {{ t("apiKeyReveal.name", { name: issuedKey?.name ?? "" }) }}
        </p>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.apiKeyRevealDone">
              {{ t("apiKeyReveal.done") }}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
