<script setup lang="ts">
import { ref } from "vue";
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
import { formatDateTime } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  link?: string;
  username?: string;
  expiresAt?: string;
  title?: string;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const copied = ref(false);

// The link is the only copy of the credential that will ever exist: the server
// keeps a hash, so this dialog's job is to get the URL onto the clipboard
// intact. Clipboard access can be missing (insecure context, denied
// permission); the value stays selectable in the block either way.
async function copy() {
  const value = props.link ?? "";
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    copied.value = false;
  }
}

function setOpen(value: boolean) {
  copied.value = false;
  emit("update:open", value);
}
</script>

<template>
  <DialogRoot :open="open" @update:open="setOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
        :data-testid="TEST_ID.inviteLinkDialog"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">
            {{ title ?? t("inviteLink.titleCreate") }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ t("inviteLink.description", { username: username ?? "" }) }}
          </DialogDescription>
        </div>

        <label class="block space-y-1 text-sm">
          <span>{{ t("inviteLink.urlLabel") }}</span>
          <div class="relative">
            <code
              class="block overflow-x-auto rounded-md border bg-muted px-3 py-2 pr-11 font-mono text-xs"
              :data-testid="TEST_ID.inviteLinkUrl"
            >
              {{ link }}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="absolute right-1 top-1 h-7 w-7"
              :aria-label="
                copied ? t('inviteLink.copied') : t('inviteLink.copyAria')
              "
              :data-testid="TEST_ID.inviteLinkCopy"
              @click="copy"
            >
              <Check v-if="copied" class="h-4 w-4 text-status-success" />
              <Copy v-else class="h-4 w-4" />
            </Button>
          </div>
        </label>

        <p
          class="text-sm text-muted-foreground"
          :data-testid="TEST_ID.inviteLinkHint"
        >
          {{ t("inviteLink.hint") }}
        </p>
        <p
          v-if="expiresAt"
          class="text-xs text-muted-foreground"
          :data-testid="TEST_ID.inviteLinkExpiry"
        >
          {{ t("inviteLink.expires", { date: formatDateTime(expiresAt) }) }}
        </p>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.inviteLinkDone">
              {{ t("inviteLink.done") }}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
