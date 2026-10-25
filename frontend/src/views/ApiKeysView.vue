<script setup lang="ts">
import { computed, ref } from "vue";
import {
  useApiKeysQuery,
  useCreateApiKey,
  useDeleteApiKey,
  useRevokeApiKey,
  useRotateApiKey,
} from "@/composables/useApiKeys";
import { mapIssuedApiKey } from "@/domains/api-keys/api-key.mapper";
import {
  API_KEY_STATUS_LABEL,
  type ApiKey,
  type IssuedApiKey,
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

const { data: apiKeys, isLoading, error, refetch } = useApiKeysQuery();
const createKey = useCreateApiKey();
const rotateKey = useRotateApiKey();
const revokeKey = useRevokeApiKey();
const deleteKey = useDeleteApiKey();

const createOpen = ref(false);
const revealOpen = ref(false);
const revealKey = ref<IssuedApiKey | null>(null);
const revealTitle = ref("API key created");

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
  return isRetiring(key) ? "Retiring" : API_KEY_STATUS_LABEL[key.status];
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

function submitCreate(payload: { name: string; expiresInDays?: number }) {
  createKey.mutate(payload, {
    onSuccess: (issued) => {
      revealKey.value = mapIssuedApiKey(issued);
      revealTitle.value = "API key created";
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
        revealTitle.value = "API key rotated";
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

function describeUsage(key: ApiKey): string {
  return key.lastUsedAt
    ? `Last used ${formatRelativeAge(key.lastUsedAt)}`
    : "Never used";
}

function describeExpiry(key: ApiKey): string | null {
  if (!key.expiresAt) return null;
  return `Expires ${formatRelativeAge(key.expiresAt)}`;
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">API keys</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Keys authenticate CI pipelines against the API. Only a signed-in
          session can manage them.
        </p>
      </div>
      <Button
        type="button"
        :data-testid="TEST_ID.newApiKey"
        @click="openCreate"
      >
        New API key
      </Button>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load API keys"
      :retry="refetch"
      :empty="keys.length === 0"
      empty-title="No API keys yet"
      empty-description="Create a key to authenticate your CI uploads."
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
            <p
              class="mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground"
              :data-testid="TEST_ID.apiKeyLastUsed"
            >
              <span>{{ describeUsage(key) }}</span>
              <span v-if="key.createdBy">· by {{ key.createdBy }}</span>
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
              :aria-label="`Rotate ${key.name}`"
              :data-testid="TEST_ID.rotateApiKey"
              @click="openRotate(key)"
            >
              Rotate
            </Button>
            <Button
              v-if="key.status === 'active'"
              type="button"
              variant="destructive"
              size="sm"
              :aria-label="`Revoke ${key.name}`"
              :data-testid="TEST_ID.revokeApiKey"
              @click="openRevoke(key)"
            >
              Revoke
            </Button>
            <Button
              v-if="!key.lastUsedAt"
              type="button"
              variant="outline"
              size="sm"
              :aria-label="`Delete ${key.name}`"
              :data-testid="TEST_ID.deleteApiKey"
              @click="requestDelete(key)"
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      <p class="text-sm text-muted-foreground">
        {{ activeCount }}
        {{ activeCount === 1 ? "key authenticates" : "keys authenticate" }}
        right now (keys in a rotation grace window included). A key that has
        been used can only be revoked — the row is the audit trail.
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
      title="Delete API key"
      confirm-text="Delete"
      cancel-text="Cancel"
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
        {{ deleteTarget?.name }} was never used, so it can be removed outright.
        A key that has authenticated a request can only be revoked.
      </template>
    </ConfirmDialog>
  </div>
</template>
