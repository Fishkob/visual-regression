<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { Check, Copy } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  useUserInvitePreview,
  useUserInviteReveal,
} from "@/composables/useUserInvite";
import type { UserInvitePreview } from "@/domains/users/user.model";
import { formatDateTime } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const route = useRoute();
const { t } = useI18n();

const token = computed(() => String(route.params.token ?? ""));
const loading = ref(true);
const preview = ref<UserInvitePreview | null>(null);
const revealed = ref<{ username: string; temporaryPassword: string } | null>(
  null,
);
const revealing = ref(false);
const revealFailed = ref(false);
const failure = ref<"not-found" | "error" | null>(null);
const copied = ref(false);

const loadPreview = useUserInvitePreview();
const revealInvite = useUserInviteReveal();

async function load(): Promise<void> {
  loading.value = true;
  const resolution = await loadPreview(token.value);
  loading.value = false;
  if (resolution.kind === "found") {
    preview.value = resolution.preview;
    return;
  }
  failure.value = resolution.kind === "not-found" ? "not-found" : "error";
}

// The one click the link allows. A 410 means somebody (or something) already
// spent it, which the page explains as a state rather than as an error.
async function reveal(): Promise<void> {
  if (revealing.value || !preview.value) return;
  revealing.value = true;
  revealFailed.value = false;
  try {
    const resolution = await revealInvite(token.value);
    if (resolution.kind === "revealed") {
      revealed.value = {
        username: resolution.username,
        temporaryPassword: resolution.temporaryPassword,
      };
      return;
    }
    if (resolution.kind === "gone") {
      preview.value = { ...preview.value, status: "used" };
      return;
    }
    if (resolution.kind === "not-found") {
      failure.value = "not-found";
      return;
    }
    revealFailed.value = true;
  } finally {
    revealing.value = false;
  }
}

async function copy(): Promise<void> {
  const value = revealed.value?.temporaryPassword ?? "";
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

onMounted(() => {
  void load();
});
</script>

<template>
  <div
    class="flex min-h-[60vh] flex-col items-center justify-center space-y-6"
    :data-testid="TEST_ID.inviteView"
  >
    <div class="flex flex-col items-center gap-2">
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        class="h-12 w-12 dark:invert"
      />
      <p
        class="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase"
      >
        Visual Regression
      </p>
    </div>

    <div
      v-if="loading"
      class="w-full max-w-md rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm"
    >
      {{ t("invite.loading") }}
    </div>

    <div
      v-else-if="failure"
      class="w-full max-w-md space-y-2 rounded-xl border bg-card p-6 text-center shadow-sm"
      :data-testid="TEST_ID.inviteStatus"
    >
      <h1 class="text-lg font-semibold">
        {{
          failure === "not-found"
            ? t("invite.notFoundTitle")
            : t("invite.errorTitle")
        }}
      </h1>
      <p class="text-sm text-muted-foreground">
        {{
          failure === "not-found"
            ? t("invite.notFoundBody")
            : t("invite.errorBody")
        }}
      </p>
    </div>

    <div
      v-else-if="preview"
      class="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-sm"
    >
      <div class="space-y-1">
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t("invite.title", { username: preview.username }) }}
        </h1>
        <p
          class="text-sm text-muted-foreground"
          :data-testid="TEST_ID.inviteUsername"
        >
          {{ t("invite.role", { role: preview.role }) }} ·
          {{ t("invite.expires", { date: formatDateTime(preview.expiresAt) }) }}
        </p>
      </div>

      <!-- The revealed password replaces the offer: the link is spent, and the
           value stays on screen so it can be read and copied. -->
      <div v-if="revealed" class="space-y-3">
        <p class="text-sm text-muted-foreground">
          {{ t("invite.passwordHint") }}
        </p>
        <div class="relative">
          <code
            class="block overflow-x-auto rounded-md border bg-muted px-3 py-2 pr-11 font-mono text-sm"
            :data-testid="TEST_ID.invitePassword"
          >
            {{ revealed.temporaryPassword }}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="absolute top-1 right-1 h-7 w-7"
            :aria-label="copied ? t('invite.copied') : t('invite.copy')"
            :data-testid="TEST_ID.inviteCopy"
            @click="copy"
          >
            <Check v-if="copied" class="h-4 w-4 text-status-success" />
            <Copy v-else class="h-4 w-4" />
          </Button>
        </div>
        <Button as-child class="w-full">
          <RouterLink
            :to="{ name: 'login' }"
            :data-testid="TEST_ID.inviteToLogin"
          >
            {{ t("invite.toLogin") }}
          </RouterLink>
        </Button>
      </div>

      <div
        v-else-if="preview.status !== 'pending'"
        class="space-y-1"
        :data-testid="TEST_ID.inviteStatus"
      >
        <h2 class="text-sm font-semibold">
          {{
            preview.status === "used"
              ? t("invite.usedTitle")
              : t("invite.expiredTitle")
          }}
        </h2>
        <p class="text-sm text-muted-foreground">
          {{
            preview.status === "used"
              ? t("invite.usedBody")
              : t("invite.expiredBody")
          }}
        </p>
      </div>

      <template v-else>
        <p class="text-sm text-muted-foreground">
          {{ t("invite.description") }}
        </p>
        <Button
          type="button"
          class="w-full"
          :disabled="revealing"
          :data-testid="TEST_ID.inviteReveal"
          @click="reveal"
        >
          {{ revealing ? t("invite.revealing") : t("invite.reveal") }}
        </Button>
        <p
          v-if="revealFailed"
          class="text-sm text-destructive"
          role="alert"
          :data-testid="TEST_ID.inviteError"
        >
          {{ t("invite.revealError") }}
        </p>
      </template>
    </div>
  </div>
</template>
