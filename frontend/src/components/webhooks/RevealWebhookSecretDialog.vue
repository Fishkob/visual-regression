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

const props = defineProps<{
  open: boolean;
  url?: string;
  secret?: string;
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
            {{ t("webhookSecret.title") }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ t("webhookSecret.description") }}
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
            :aria-label="
              copied
                ? t('webhookSecret.copiedAria')
                : t('webhookSecret.copyAria')
            "
            @click="copy"
          >
            <Check v-if="copied" class="h-4 w-4" />
            <Copy v-else class="h-4 w-4" />
            <span>{{
              copied ? t("webhookSecret.copied") : t("webhookSecret.copy")
            }}</span>
          </Button>
        </div>

        <p v-if="url" class="text-sm text-muted-foreground">
          {{ t("webhookSecret.endpoint", { url }) }}
        </p>

        <p class="text-sm text-muted-foreground">
          {{ t("webhookSecret.headers") }}
        </p>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.webhookSecretDone">
              {{ t("webhookSecret.done") }}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
