<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Plus } from "@lucide/vue";
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
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import CreateApiKeyDialog from "@/components/api-keys/CreateApiKeyDialog.vue";
import RevokeApiKeyDialog from "@/components/api-keys/RevokeApiKeyDialog.vue";
import RevealApiKeyDialog from "@/components/api-keys/RevealApiKeyDialog.vue";
import RotateApiKeyDialog from "@/components/api-keys/RotateApiKeyDialog.vue";

const { t } = useI18n();
const STATUS_KEY: Record<ApiKey["status"], string> = {
  active: "apiKeys.active",
  revoked: "apiKeys.revoked",
  expired: "apiKeys.expired",
};
const { data: apiKeys, isLoading, error, refetch } = useApiKeysQuery();
const createKey = useCreateApiKey();
const deleteKey = useDeleteApiKey();
const rotateKey = useRotateApiKey();
const revokeKey = useRevokeApiKey();

const createOpen = ref(false);
const revealOpen = ref(false);
const revealKey = ref<IssuedApiKey | null>(null);
// The reveal dialog serves both "here is your new key" moments; the title says
// which one it is, because a rotation's key replaces a working credential.
const revealedAfterRotation = ref(false);

const deleteOpen = ref(false);
const deleteTarget = ref<ApiKey | null>(null);
const rotateOpen = ref(false);
const rotateTarget = ref<ApiKey | null>(null);
const revokeOpen = ref(false);
const revokeTarget = ref<ApiKey | null>(null);

const keys = computed(() => apiKeys.value ?? []);
const activeCount = computed(
  () => keys.value.filter((key) => key.status === "active").length,
);

const deleteDescription = computed(() =>
  t("apiKeys.deleteDescription", { name: deleteTarget.value?.name ?? "" }),
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

// A rotating key is already replaced: rotating it again would mint a second
// successor for a row that is about to stop working anyway. Revoking stays open
// for it, because killing the old key early is exactly what a retiring key is
// for. Revoked and expired keys authenticate nothing, so neither action applies.
function canRotate(key: ApiKey): boolean {
  return key.status === "active" && !isRetiring(key);
}

function canRevoke(key: ApiKey): boolean {
  return key.status === "active";
}

function openCreate() {
  createKey.reset();
  revealedAfterRotation.value = false;
  createOpen.value = true;
}

function submitCreate(payload: CreateApiKeyInput) {
  createKey.mutate(payload, {
    onSuccess: (issued) => {
      revealKey.value = mapIssuedApiKey(issued);
      createOpen.value = false;
      revealOpen.value = true;
    },
  });
}

function requestRotate(key: ApiKey) {
  rotateKey.reset();
  rotateTarget.value = key;
  rotateOpen.value = true;
}

function submitRotate(payload: { graceMinutes: number }) {
  const target = rotateTarget.value;
  if (!target) return;
  rotateKey.mutate(
    { id: target.id, ...payload },
    {
      onSuccess: (issued) => {
        rotateOpen.value = false;
        rotateTarget.value = null;
        // The successor's raw key exists once, so it goes straight to the same
        // reveal dialog creation uses.
        revealedAfterRotation.value = true;
        revealKey.value = mapIssuedApiKey(issued);
        revealOpen.value = true;
      },
    },
  );
}

function requestRevoke(key: ApiKey) {
  revokeKey.reset();
  revokeTarget.value = key;
  revokeOpen.value = true;
}

function submitRevoke(payload: { reason?: string }) {
  const target = revokeTarget.value;
  if (!target) return;
  revokeKey.mutate(
    { id: target.id, ...payload },
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

// Every relative age carries its absolute timestamp as a tooltip, the same way
// the user and webhook lists do.
function absolute(iso: string | null): string | undefined {
  return iso ? formatDateTime(iso) : undefined;
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t("apiKeys.title") }}
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ t("apiKeys.subtitle") }}
        </p>
      </div>
      <Button
        type="button"
        :data-testid="TEST_ID.newApiKey"
        @click="openCreate"
      >
        <Plus class="h-4 w-4" />
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
              <div class="h-4 w-32 animate-pulse rounded bg-muted" />
              <div class="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <ul class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <li
            v-for="key in keys"
            :key="key.id"
            class="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            :data-testid="TEST_ID.apiKeyRow"
          >
            <div class="min-w-0 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <p
                  class="truncate font-medium"
                  :title="key.name"
                  :data-testid="TEST_ID.apiKeyName"
                >
                  {{ key.name }}
                </p>
                <Badge
                  variant="outline"
                  :class="badgeClass(key)"
                  :data-testid="TEST_ID.apiKeyStatus"
                >
                  {{ statusLabel(key) }}
                </Badge>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <div
                  class="flex flex-wrap items-center gap-1"
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
                  class="flex flex-wrap items-center gap-1"
                  :data-testid="TEST_ID.apiKeyProjects"
                >
                  <Badge
                    v-if="key.projectNames.length === 0"
                    variant="outline"
                    class="text-[10px] text-muted-foreground"
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
              </div>

              <p
                class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
                :data-testid="TEST_ID.apiKeyLastUsed"
              >
                <span :data-testid="TEST_ID.apiKeyOwner">
                  {{ t("apiKeys.owner", { owner: ownerLabel(key) }) }}
                </span>
                <span :title="absolute(key.createdAt)">
                  ·
                  {{
                    t("apiKeys.createdAge", {
                      age: formatRelativeAge(key.createdAt),
                    })
                  }}
                </span>
                <span :title="absolute(key.lastUsedAt)">
                  · {{ describeUsage(key) }}
                </span>
                <span
                  v-if="describeExpiry(key)"
                  :title="absolute(key.expiresAt)"
                >
                  · {{ describeExpiry(key) }}
                </span>
                <span v-if="key.revokedReason">
                  · {{ key.revokedReason }}
                </span>
              </p>
            </div>

            <div class="flex flex-wrap shrink-0 items-center justify-end gap-2">
              <Button
                v-if="canRotate(key)"
                type="button"
                variant="outline"
                size="sm"
                :aria-label="t('apiKeys.rotateAria', { name: key.name })"
                :data-testid="TEST_ID.rotateApiKey"
                @click="requestRotate(key)"
              >
                {{ t("apiKeys.rotate") }}
              </Button>
              <Button
                v-if="canRevoke(key)"
                type="button"
                variant="outline"
                size="sm"
                :aria-label="t('apiKeys.revokeAria', { name: key.name })"
                :data-testid="TEST_ID.revokeApiKey"
                @click="requestRevoke(key)"
              >
                {{ t("apiKeys.revoke") }}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                :aria-label="t('apiKeys.deleteAria', { name: key.name })"
                :data-testid="TEST_ID.deleteApiKey"
                @click="requestDelete(key)"
              >
                {{ t("apiKeys.delete") }}
              </Button>
            </div>
          </li>
        </ul>

        <p class="text-xs text-muted-foreground">
          {{ t("apiKeys.activeCount", activeCount) }}
        </p>
      </div>
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
      :title="
        revealedAfterRotation ? t('apiKeys.rotated') : t('apiKeys.created')
      "
      @update:open="revealOpen = $event"
    />

    <RotateApiKeyDialog
      :open="rotateOpen"
      :key-name="rotateTarget?.name"
      :pending="rotateKey.isPending.value"
      @update:open="rotateOpen = $event"
      @submit="submitRotate"
    />

    <RevokeApiKeyDialog
      :open="revokeOpen"
      :key-name="revokeTarget?.name"
      :pending="revokeKey.isPending.value"
      @update:open="revokeOpen = $event"
      @submit="submitRevoke"
    />

    <ConfirmDialog
      :open="deleteOpen"
      :pending="deleteKey.isPending.value"
      confirm-variant="destructive"
      :title="t('apiKeys.deleteTitle')"
      :description="deleteDescription"
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
    />
  </div>
</template>
