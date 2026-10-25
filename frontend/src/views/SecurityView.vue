<script setup lang="ts">
import { computed, ref } from "vue";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import FormDialog from "@/components/FormDialog.vue";
import RecoveryCodesDialog from "@/components/security/RecoveryCodesDialog.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMeQuery } from "@/composables/useAuth";
import {
  useDisableTwoFactor,
  useEnableTwoFactor,
  useRevokeAllSessions,
  useRevokeSession,
  useSessionsQuery,
  useTwoFactorSetup,
} from "@/composables/useSecurity";
import {
  mapRecoveryCodes,
  mapTwoFactorSetup,
} from "@/domains/security/security.mapper";
import type {
  Session,
  TwoFactorSetup,
} from "@/domains/security/security.model";
import { formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const { data: me } = useMeQuery();
const { data: sessionData, isLoading, error, refetch } = useSessionsQuery();
const setup = useTwoFactorSetup();
const enable = useEnableTwoFactor();
const disable = useDisableTwoFactor();
const revoke = useRevokeSession();
const revokeAll = useRevokeAllSessions();

const totpEnabled = computed(() => me.value?.totpEnabled === true);
const sessions = computed(() => sessionData.value ?? []);
const otherSessions = computed(
  () => sessions.value.filter((session) => !session.isCurrent).length,
);

// Setup is a one-shot mutation answer held in component state: the secret is
// never cached, never persisted and disappears once 2FA is enabled.
const setupData = ref<TwoFactorSetup | null>(null);
const setupCode = ref("");
const setupPending = computed(() => setup.isPending.value);
const enablePending = computed(() => enable.isPending.value);

function startSetup() {
  setup.reset();
  setup.mutate(undefined, {
    onSuccess: (dto) => {
      setupData.value = mapTwoFactorSetup(dto);
      setupCode.value = "";
    },
  });
}

const recoveryCodes = ref<string[]>([]);
const recoveryOpen = ref(false);

function confirmEnable() {
  enable.mutate(setupCode.value.trim(), {
    onSuccess: (dto) => {
      recoveryCodes.value = mapRecoveryCodes(dto);
      setupData.value = null;
      setupCode.value = "";
      recoveryOpen.value = true;
    },
  });
}

const disableOpen = ref(false);
const disablePassword = ref("");

function openDisable() {
  disable.reset();
  disablePassword.value = "";
  disableOpen.value = true;
}

function confirmDisable() {
  disable.mutate(disablePassword.value, {
    onSuccess: () => {
      disableOpen.value = false;
      disablePassword.value = "";
    },
  });
}

const revokeTarget = ref<Session | null>(null);
const revokeOpen = ref(false);

const revokeDescription = computed(() => {
  const target = revokeTarget.value;
  if (!target) return "";
  const origin = target.ip ? ` from ${target.ip}` : "";
  return `Revoking the session${origin} signs it out immediately; it must sign in again.`;
});

function requestRevoke(session: Session) {
  revoke.reset();
  revokeTarget.value = session;
  revokeOpen.value = true;
}

function confirmRevoke() {
  const target = revokeTarget.value;
  if (!target) return;
  revoke.mutate(target.id, {
    onSuccess: () => {
      revokeOpen.value = false;
      revokeTarget.value = null;
    },
  });
}

const revokeAllOpen = ref(false);

function confirmRevokeAll() {
  revokeAll.mutate();
}

function absoluteTime(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function lastSeenLabel(session: Session): string {
  return session.lastSeenAt ? formatRelativeAge(session.lastSeenAt) : "never";
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.securityView">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">Security</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Protect your account with a second factor and review the devices that
        are signed in.
      </p>
    </div>

    <section class="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="font-medium">Two-factor authentication</h2>
          <p class="text-sm text-muted-foreground">
            {{
              totpEnabled
                ? "Enabled — a code from your authenticator app is required at every sign-in."
                : "Not enabled — add a time-based one-time code as a second factor."
            }}
          </p>
        </div>
        <Button
          v-if="!totpEnabled && !setupData"
          type="button"
          :disabled="setupPending"
          :data-testid="TEST_ID.twoFactorEnable"
          @click="startSetup"
        >
          {{ setupPending ? "Starting…" : "Enable 2FA" }}
        </Button>
        <Button
          v-if="totpEnabled"
          type="button"
          variant="destructive"
          :data-testid="TEST_ID.twoFactorDisable"
          @click="openDisable"
        >
          Disable 2FA
        </Button>
      </div>

      <div v-if="setupData" class="space-y-3 rounded-lg border bg-muted/30 p-3">
        <p class="text-sm">
          Add this secret to your authenticator app, or use the setup URI. No QR
          code is required.
        </p>
        <div class="space-y-1">
          <span class="text-xs font-medium text-muted-foreground uppercase">
            Secret
          </span>
          <code
            class="block overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-sm select-all"
            :data-testid="TEST_ID.twoFactorSecret"
          >
            {{ setupData.secret }}
          </code>
        </div>
        <div class="space-y-1">
          <span class="text-xs font-medium text-muted-foreground uppercase">
            Setup URI
          </span>
          <code
            class="block overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs select-all"
            :data-testid="TEST_ID.twoFactorSetupUri"
          >
            {{ setupData.otpauthUrl }}
          </code>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <label class="space-y-1 text-sm">
            <span>Code</span>
            <Input
              v-model="setupCode"
              type="text"
              autocomplete="one-time-code"
              placeholder="123456"
              class="w-36 font-mono tracking-widest"
              :data-testid="TEST_ID.twoFactorCode"
            />
          </label>
          <Button
            type="button"
            :disabled="enablePending || !setupCode.trim()"
            :data-testid="TEST_ID.twoFactorConfirm"
            @click="confirmEnable"
          >
            {{ enablePending ? "Enabling…" : "Enable 2FA" }}
          </Button>
        </div>
      </div>

      <p v-if="totpEnabled" class="text-sm text-muted-foreground">
        Recovery codes were issued when you enabled two-factor authentication.
        Each one works once; store them somewhere safe. Disabling removes them.
      </p>
    </section>

    <section class="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="font-medium">Sessions</h2>
          <p class="text-sm text-muted-foreground">
            Browsers and devices currently signed in to your account. The
            current session cannot be revoked here.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          :disabled="otherSessions === 0"
          :data-testid="TEST_ID.sessionsRevokeAll"
          @click="revokeAllOpen = true"
        >
          Log out other sessions
        </Button>
      </div>

      <AsyncState
        :is-loading="isLoading"
        :error="error"
        error-title="Failed to load sessions"
        :retry="refetch"
        :empty="sessions.length === 0"
      >
        <template #loading>
          <div class="space-y-2" aria-hidden="true">
            <div
              v-for="row in 2"
              :key="row"
              class="h-16 animate-pulse rounded-lg bg-muted"
            />
          </div>
        </template>

        <template #empty>
          <div class="py-6 text-center text-sm text-muted-foreground">
            No active sessions found.
          </div>
        </template>

        <ul
          class="divide-y overflow-hidden rounded-lg border"
          :data-testid="TEST_ID.sessionsList"
        >
          <li
            v-for="session in sessions"
            :key="session.id"
            class="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
            :data-testid="TEST_ID.sessionRow"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <Badge
                  v-if="session.isCurrent"
                  variant="secondary"
                  :data-testid="TEST_ID.sessionCurrent"
                >
                  This session
                </Badge>
                <span class="text-sm">{{ session.ip ?? "Unknown IP" }}</span>
              </div>
              <p class="text-xs text-muted-foreground">
                Created
                <span :title="absoluteTime(session.createdAt)">
                  {{ formatRelativeAge(session.createdAt) }}
                </span>
                · Last seen {{ lastSeenLabel(session) }} · Expires
                <span :title="absoluteTime(session.expiresAt)">
                  {{ formatRelativeAge(session.expiresAt) }}
                </span>
              </p>
              <p
                class="max-w-full truncate text-xs text-muted-foreground"
                :title="session.userAgent ?? undefined"
              >
                {{ session.userAgent ?? "No user agent recorded" }}
              </p>
            </div>
            <Button
              v-if="!session.isCurrent"
              type="button"
              variant="outline"
              size="sm"
              :aria-label="`Revoke the session${session.ip ? ` from ${session.ip}` : ''}`"
              :data-testid="TEST_ID.sessionRevoke"
              @click="requestRevoke(session)"
            >
              Revoke
            </Button>
            <span v-else class="text-xs text-muted-foreground"> Current </span>
          </li>
        </ul>
      </AsyncState>
    </section>

    <FormDialog
      :open="disableOpen"
      title="Disable two-factor authentication"
      description="Confirm with your password. The recovery codes from the time you enabled 2FA stop working."
      confirm-text="Disable 2FA"
      :pending="disable.isPending.value"
      :submit-disabled="!disablePassword"
      :confirm-test-id="TEST_ID.twoFactorDisableSubmit"
      @update:open="disableOpen = $event"
      @submit="confirmDisable"
    >
      <label class="block space-y-1 text-sm">
        <span>Password</span>
        <Input
          v-model="disablePassword"
          type="password"
          autocomplete="current-password"
          :data-testid="TEST_ID.twoFactorPassword"
        />
      </label>
    </FormDialog>

    <ConfirmDialog
      :open="revokeOpen"
      :pending="revoke.isPending.value"
      title="Revoke session"
      :description="revokeDescription"
      confirm-text="Revoke session"
      cancel-text="Cancel"
      @confirm="confirmRevoke"
      @cancel="revokeOpen = false"
      @update:open="revokeOpen = $event"
    />

    <ConfirmDialog
      :open="revokeAllOpen"
      :pending="revokeAll.isPending.value"
      title="Log out other sessions"
      description="Signs out every session except this one. Devices must sign in again."
      confirm-text="Log out others"
      cancel-text="Cancel"
      @confirm="confirmRevokeAll"
      @cancel="revokeAllOpen = false"
      @update:open="revokeAllOpen = $event"
    />

    <RecoveryCodesDialog
      :open="recoveryOpen"
      :codes="recoveryCodes"
      @update:open="recoveryOpen = $event"
    />
  </div>
</template>
