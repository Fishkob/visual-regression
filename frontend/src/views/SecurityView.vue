<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useRevokeAllSessions,
  useRevokeSession,
  useSessionsQuery,
} from "@/composables/useSecurity";
import type { Session } from "@/domains/security/security.model";
import { formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();
const { data: sessionData, isLoading, error, refetch } = useSessionsQuery();
const revoke = useRevokeSession();
const revokeAll = useRevokeAllSessions();

const sessions = computed(() => sessionData.value ?? []);
const otherSessions = computed(
  () => sessions.value.filter((session) => !session.isCurrent).length,
);

const revokeTarget = ref<Session | null>(null);
const revokeOpen = ref(false);

const revokeDescription = computed(() => {
  const target = revokeTarget.value;
  if (!target) return "";
  return target.ip
    ? t("security.revokeDescriptionIp", { ip: target.ip })
    : t("security.revokeDescriptionNoIp");
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

function lastSeenLabel(session: Session): string {
  return session.lastSeenAt
    ? formatRelativeAge(session.lastSeenAt)
    : t("security.never");
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.securityView">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">
        {{ t("security.title") }}
      </h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        {{ t("security.subtitle") }}
      </p>
    </div>

    <section class="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="font-medium">{{ t("security.sessionsTitle") }}</h2>
          <p class="text-sm text-muted-foreground">
            {{ t("security.sessionsHelp") }}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          :disabled="otherSessions === 0"
          :data-testid="TEST_ID.sessionsRevokeAll"
          @click="revokeAllOpen = true"
        >
          {{ t("security.logoutOthers") }}
        </Button>
      </div>

      <AsyncState
        :is-loading="isLoading"
        :error="error"
        :error-title="t('security.sessionsError')"
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
            {{ t("security.noSessions") }}
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
                  {{ t("security.thisSession") }}
                </Badge>
                <span class="text-sm">{{
                  session.ip ?? t("security.unknownIp")
                }}</span>
              </div>
              <p class="text-xs text-muted-foreground">
                {{
                  t("security.sessionMeta", {
                    created: formatRelativeAge(session.createdAt),
                    lastSeen: lastSeenLabel(session),
                    expires: formatRelativeAge(session.expiresAt),
                  })
                }}
              </p>
              <p
                class="max-w-full truncate text-xs text-muted-foreground"
                :title="session.userAgent ?? undefined"
              >
                {{ session.userAgent ?? t("security.noUserAgent") }}
              </p>
            </div>
            <Button
              v-if="!session.isCurrent"
              type="button"
              variant="outline"
              size="sm"
              :aria-label="
                session.ip
                  ? t('security.revokeAriaIp', { ip: session.ip })
                  : t('security.revokeAria')
              "
              :data-testid="TEST_ID.sessionRevoke"
              @click="requestRevoke(session)"
            >
              {{ t("security.revoke") }}
            </Button>
            <span v-else class="text-xs text-muted-foreground">
              {{ t("security.current") }}
            </span>
          </li>
        </ul>
      </AsyncState>
    </section>

    <ConfirmDialog
      :open="revokeOpen"
      :pending="revoke.isPending.value"
      :title="t('security.revokeTitle')"
      :description="revokeDescription"
      :confirm-text="t('security.revokeConfirm')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmRevoke"
      @cancel="revokeOpen = false"
      @update:open="revokeOpen = $event"
    />

    <ConfirmDialog
      :open="revokeAllOpen"
      :pending="revokeAll.isPending.value"
      :title="t('security.revokeAllTitle')"
      :description="t('security.revokeAllDescription')"
      :confirm-text="t('security.revokeAllConfirm')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmRevokeAll"
      @cancel="revokeAllOpen = false"
      @update:open="revokeAllOpen = $event"
    />
  </div>
</template>
