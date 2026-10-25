<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  useApiKeysQuery,
  useCreateApiKey,
  useDeleteApiKey,
  useRevokeApiKey,
  useRotateApiKey,
} from "@/composables/useApiKeys";
import { mapIssuedApiKey } from "@/domains/api-keys/api-key.mapper";
import type {
  ApiKey,
  CreateApiKeyInput,
  IssuedApiKey,
} from "@/domains/api-keys/api-key.model";
import { formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import CreateApiKeyDialog from "@/components/api-keys/CreateApiKeyDialog.vue";
import RevealApiKeyDialog from "@/components/api-keys/RevealApiKeyDialog.vue";
import RotateApiKeyDialog from "@/components/api-keys/RotateApiKeyDialog.vue";
import RevokeApiKeyDialog from "@/components/api-keys/RevokeApiKeyDialog.vue";

const { t } = useI18n();
const STATUS_KEY: Record<ApiKey["status"], string> = {
  active: "apiKeys.active",
  revoked: "apiKeys.revoked",
  expired: "apiKeys.expired",
};
const { data: apiKeys, isLoading, error, refetch } = useApiKeysQuery();
const createKey = useCreateApiKey();
const rotateKey = useRotateApiKey();
const revokeKey = useRevokeApiKey();
const deleteKey = useDeleteApiKey();

const createOpen = ref(false);
const revealOpen = ref(false);
const revealKey = ref<IssuedApiKey | null>(null);
const revealTitle = ref(t("apiKeys.created"));

const rotateOpen = ref(false);
const rotateTarget = ref<ApiKey | null>(null);
const revokeOpen = ref(false);
const revokeTarget = ref<ApiKey | null>(null);
const deleteOpen = ref(false);
const deleteTarget = ref<ApiKey | null>(null);

const keys = computed(() => apiKeys.value ?? []);
const activeCount = computed(
  () => keys.value.filter((key) => key.status === "active").length,
);

// Mirrors the status-badge convention in domains/test-status: an outline plus
// the status text color, no filled background. A tinted background drops the
// text below the 4.5:1 contrast the a11y suite enforces.
const statusClass: Record<ApiKey["status"], string> = {
  active: "border-status-success text-status-success",
  revoked: "border-status-neutral text-status-neutral",
  expired: "border-status-warning text-status-warning",
};

// A key replaced by a rotation keeps authenticating until its grace window
// closes, so the server reports it as active — correct for auth, misleading in
// the list. The replacement pointer is what distinguishes the two states.
function isRetiring(key: ApiKey): boolean {
  return key.status === "active" && key.replacedById !== null;
}

function statusLabel(key: ApiKey): string {
  return isRetiring(key) ? t("apiKeys.retiring") : t(STATUS_KEY[key.status]);
}

function badgeClass(key: ApiKey): string {
  return isRetiring(key)
    ? "border-status-warning text-status-warning"
    : statusClass[key.status];
}

function openCreate() {
  createKey.reset();
  createOpen.value = true;
}

function submitCreate(payload: CreateApiKeyInput) {
  createKey.mutate(payload, {
    onSuccess: (issued) => {
      revealKey.value = mapIssuedApiKey(issued);
      revealTitle.value = t("apiKeys.created");
      createOpen.value = false;
      revealOpen.value = true;
    },
  });
}

function openRotate(key: ApiKey) {
  rotateKey.reset();
  rotateTarget.value = key;
  rotateOpen.value = true;
}

function submitRotate(payload: {
  graceMinutes: number;
  expiresInDays?: number | null;
}) {
  const target = rotateTarget.value;
  if (!target) return;
  rotateKey.mutate(
    {
      id: target.id,
      rotation: {
        ...(payload.graceMinutes > 0
          ? { graceMinutes: payload.graceMinutes }
          : {}),
        ...(payload.expiresInDays === undefined
          ? {}
          : { expiresInDays: payload.expiresInDays }),
      },
    },
    {
      onSuccess: (issued) => {
        revealKey.value = mapIssuedApiKey(issued);
        revealTitle.value = t("apiKeys.rotated");
        rotateOpen.value = false;
        rotateTarget.value = null;
        revealOpen.value = true;
      },
    },
  );
}

function openRevoke(key: ApiKey) {
  revokeKey.reset();
  revokeTarget.value = key;
  revokeOpen.value = true;
}

function submitRevoke(reason: string | undefined) {
  const target = revokeTarget.value;
  if (!target) return;
  revokeKey.mutate(
    { id: target.id, reason },
    {
      onSuccess: () => {
        revokeOpen.value = false;
        revokeTarget.value = null;
      },
    },
  );
}

function requestDelete(key: ApiKey) {
  deleteKey.reset();
  deleteTarget.value = key;
  deleteOpen.value = true;
}

function confirmDelete() {
  const target = deleteTarget.value;
  if (!target) return;
  deleteKey.mutate(target.id, {
    onSuccess: () => {
      deleteOpen.value = false;
      deleteTarget.value = null;
    },
  });
}

// The owner is the account the key belongs to; createdBy is the legacy actor
// field from before ownership existed, so it is the fallback.
function ownerLabel(key: ApiKey): string {
  return key.ownerUsername ?? key.createdBy ?? "—";
}

function describeUsage(key: ApiKey): string {
  return key.lastUsedAt
    ? t("apiKeys.lastUsed", { age: formatRelativeAge(key.lastUsedAt) })
    : t("apiKeys.neverUsed");
}

function describeExpiry(key: ApiKey): string | null {
  if (!key.expiresAt) return null;
  return t("apiKeys.expires", { age: formatRelativeAge(key.expiresAt) });
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t("apiKeys.title") }}
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t("apiKeys.subtitle") }}
        </p>
      </div>
      <Button
        type="button"
        :data-testid="TEST_ID.newApiKey"
        @click="openCreate"
      >
        {{ t("apiKeys.newKey") }}
      </Button>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('apiKeys.errorTitle')"
      :retry="refetch"
      :empty="keys.length === 0"
      :empty-title="t('apiKeys.emptyTitle')"
      :empty-description="t('apiKeys.emptyDescription')"
    >
      <template #loading>
        <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div
            v-for="i in 3"
            :key="i"
            class="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div class="space-y-2">
              <div class="h-4 w-24 animate-pulse rounded bg-muted" />
              <div class="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
            <div class="flex gap-2">
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </template>

      <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          v-for="key in keys"
          :key="key.id"
          class="flex flex-col gap-3 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
          :data-testid="TEST_ID.apiKeyRow"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="truncate font-medium" :data-testid="TEST_ID.apiKeyName">
                {{ key.name }}
              </p>
              <Badge
                variant="outline"
                :class="badgeClass(key)"
                :data-testid="TEST_ID.apiKeyStatus"
              >
                {{ statusLabel(key) }}
              </Badge>
              <code
                v-if="key.keyHint"
                class="font-mono text-xs text-muted-foreground"
                :data-testid="TEST_ID.apiKeyHint"
              >
                …{{ key.keyHint }}
              </code>
            </div>
            <div
              class="mt-1 flex flex-wrap items-center gap-1"
              :data-testid="TEST_ID.apiKeyScopes"
            >
              <Badge
                v-for="scope in key.scopes"
                :key="scope"
                variant="secondary"
                class="font-mono text-[10px]"
              >
                {{ scope }}
              </Badge>
            </div>

            <div
              class="mt-1 flex flex-wrap items-center gap-1"
              :data-testid="TEST_ID.apiKeyProjects"
            >
              <Badge
                v-if="key.projectNames.length === 0"
                variant="outline"
                class="text-[10px]"
              >
                {{ t("apiKeys.allProjects") }}
              </Badge>
              <Badge
                v-for="projectName in key.projectNames"
                :key="projectName"
                variant="outline"
                class="font-mono text-[10px]"
              >
                {{ projectName }}
              </Badge>
            </div>

            <p
              class="mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground"
              :data-testid="TEST_ID.apiKeyLastUsed"
            >
              <span :data-testid="TEST_ID.apiKeyOwner">
                {{ t("apiKeys.owner", { owner: ownerLabel(key) }) }}
              </span>
              <span>· {{ describeUsage(key) }}</span>
              <span v-if="describeExpiry(key)">
                · {{ describeExpiry(key) }}
              </span>
              <span v-if="key.revokedReason"> · {{ key.revokedReason }} </span>
            </p>
          </div>

          <div class="flex shrink-0 gap-2">
            <Button
              v-if="key.status === 'active'"
              type="button"
              variant="outline"
              size="sm"
              :aria-label="t('apiKeys.rotateAria', { name: key.name })"
              :data-testid="TEST_ID.rotateApiKey"
              @click="openRotate(key)"
            >
              {{ t("apiKeys.rotate") }}
            </Button>
            <Button
              v-if="key.status === 'active'"
              type="button"
              variant="destructive"
              size="sm"
              :aria-label="t('apiKeys.revokeAria', { name: key.name })"
              :data-testid="TEST_ID.revokeApiKey"
              @click="openRevoke(key)"
            >
              {{ t("apiKeys.revoke") }}
            </Button>
            <Button
              v-if="!key.lastUsedAt"
              type="button"
              variant="outline"
              size="sm"
              :aria-label="t('apiKeys.deleteAria', { name: key.name })"
              :data-testid="TEST_ID.deleteApiKey"
              @click="requestDelete(key)"
            >
              {{ t("apiKeys.delete") }}
            </Button>
          </div>
        </div>
      </div>

      <p class="text-sm text-muted-foreground">
        {{ t("apiKeys.activeCount", activeCount) }}
      </p>
    </AsyncState>

    <CreateApiKeyDialog
      :open="createOpen"
      :pending="createKey.isPending.value"
      :error="createKey.error.value"
      @update:open="createOpen = $event"
      @submit="submitCreate"
    />

    <RevealApiKeyDialog
      :open="revealOpen"
      :issued-key="revealKey"
      :title="revealTitle"
      @update:open="revealOpen = $event"
    />

    <RotateApiKeyDialog
      :open="rotateOpen"
      :api-key="rotateTarget"
      :pending="rotateKey.isPending.value"
      :error="rotateKey.error.value"
      @update:open="rotateOpen = $event"
      @submit="submitRotate"
    />

    <RevokeApiKeyDialog
      :open="revokeOpen"
      :api-key="revokeTarget"
      :pending="revokeKey.isPending.value"
      :error="revokeKey.error.value"
      @update:open="revokeOpen = $event"
      @submit="submitRevoke"
    />

    <ConfirmDialog
      :open="deleteOpen"
      :pending="deleteKey.isPending.value"
      confirm-variant="destructive"
      :title="t('apiKeys.deleteTitle')"
      :confirm-text="t('apiKeys.delete')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmDelete"
      @cancel="
        () => {
          deleteOpen = false;
          deleteTarget = null;
        }
      "
      @update:open="deleteOpen = $event"
    >
      <template #description>
        {{ t("apiKeys.deleteDescription", { name: deleteTarget?.name ?? "" }) }}
      </template>
    </ConfirmDialog>
  </div>
</template>
