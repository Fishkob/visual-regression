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
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  password?: string;
  username?: string;
  title?: string;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const copied = ref(false);

// The password is handed over out of band, so the dialog's job is to get it onto
// the clipboard intact. Clipboard access can be missing (insecure context,
// denied permission); the value stays selectable in the block either way.
async function copy() {
  const value = props.password ?? "";
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
        :data-testid="TEST_ID.temporaryPasswordDialog"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">
            {{ title ?? t("tempPassword.title") }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ t("tempPassword.description") }}
          </DialogDescription>
        </div>

        <p v-if="username" class="text-sm">
          <span class="text-muted-foreground">{{
            t("tempPassword.user")
          }}</span>
          <span class="ml-1 font-medium">{{ username }}</span>
        </p>

        <div class="relative">
          <code
            class="block overflow-x-auto rounded-md border bg-muted px-3 py-2 pr-11 font-mono text-sm"
            :data-testid="TEST_ID.temporaryPasswordValue"
          >
            {{ password }}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="absolute right-1 top-1 h-7 w-7"
            :aria-label="
              copied ? t('tempPassword.copied') : t('tempPassword.copy')
            "
            :data-testid="TEST_ID.temporaryPasswordCopy"
            @click="copy"
          >
            <Check v-if="copied" class="h-4 w-4 text-status-success" />
            <Copy v-else class="h-4 w-4" />
          </Button>
        </div>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" :data-testid="TEST_ID.temporaryPasswordDone">
              {{ t("tempPassword.done") }}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
