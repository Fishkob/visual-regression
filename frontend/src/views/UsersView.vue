<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useMediaQuery } from "@vueuse/core";
import { Search } from "@lucide/vue";
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import ChangeUserRoleDialog from "@/components/users/ChangeUserRoleDialog.vue";
import CreateUserDialog from "@/components/users/CreateUserDialog.vue";
import TemporaryPasswordDialog from "@/components/users/TemporaryPasswordDialog.vue";
import UserRowActions from "@/components/users/UserRowActions.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMeQuery } from "@/composables/useAuth";
import {
  useCreateUser,
  useResetUserPassword,
  useUpdateUser,
  useUsersQuery,
} from "@/composables/useUsers";
import {
  mapCreatedUser,
  mapResetPasswordResult,
} from "@/domains/users/user.mapper";
import { ROLE_BADGE_VARIANT, type UserRole } from "@/domains/auth/auth.model";
import type { User } from "@/domains/users/user.model";
import { TEST_ID } from "@/lib/test-ids";

const { t } = useI18n();
const { data, isLoading, error, refetch } = useUsersQuery();
const { data: me } = useMeQuery();
const createUser = useCreateUser();
const updateUser = useUpdateUser();
const resetPassword = useResetUserPassword();

// Newest first: an account created a minute ago is the one being managed, and the
// API's oldest-first order buried it below every seeded row.
const users = computed(() =>
  [...(data.value ?? [])].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      a.username.localeCompare(b.username),
  ),
);

const search = ref("");
const visibleUsers = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return users.value;
  return users.value.filter((user) =>
    user.username.toLowerCase().includes(query),
  );
});

// Five columns plus an action cell do not fit a phone — the action cell used to
// sit outside the viewport behind a horizontal scroll. The table arrives at `lg`
// (where the sidebar still leaves it room) and the creation column joins at `xl`;
// only one of the two layouts is in the DOM, so row testids never appear twice.
const isDesktop = useMediaQuery("(min-width: 1024px)");

const currentUsername = computed(() => me.value?.username ?? null);
const activeAdmins = computed(() =>
  users.value.filter((user) => user.role === "ADMIN" && user.isActive),
);

function isSelf(user: User): boolean {
  return (
    currentUsername.value !== null && user.username === currentUsername.value
  );
}

// Every dead end the admin would otherwise walk into, stated before the click:
// the API refuses self-deactivation and removing the last active admin, and a
// reset or demotion of your own account would end the session you are working
// in. The menu renders these as disabled items with the reason attached.
function blockedFor(user: User): {
  reset?: string;
  role?: string;
  deactivate?: string;
} {
  if (isSelf(user)) {
    return {
      reset: t("users.blockedSelfReset"),
      role: t("users.blockedSelfRole"),
      ...(user.isActive
        ? { deactivate: t("users.blockedSelfDeactivate") }
        : {}),
    };
  }
  const lastAdmin = user.isActive && activeAdmins.value.length <= 1;
  if (lastAdmin && user.role === "ADMIN") {
    return {
      deactivate: t("users.blockedLastAdmin"),
      role: t("users.blockedLastAdmin"),
    };
  }
  return {};
}

const createOpen = ref(false);
const tempOpen = ref(false);
const temporaryPassword = ref("");
const temporaryUsername = ref("");
const temporaryTitle = ref(t("users.userCreated"));

function openCreate() {
  createUser.reset();
  createOpen.value = true;
}

function submitCreate(payload: { username: string; role: UserRole }) {
  createUser.mutate(payload, {
    onSuccess: (created) => {
      const result = mapCreatedUser(created);
      createOpen.value = false;
      temporaryUsername.value = result.user.username;
      temporaryPassword.value = result.temporaryPassword;
      temporaryTitle.value = t("users.userCreated");
      tempOpen.value = true;
    },
  });
}

const resetTarget = ref<User | null>(null);
const resetOpen = ref(false);

function requestReset(user: User) {
  resetPassword.reset();
  resetTarget.value = user;
  resetOpen.value = true;
}

function confirmReset() {
  const target = resetTarget.value;
  if (!target) return;
  resetPassword.mutate(target.id, {
    onSuccess: (result) => {
      resetOpen.value = false;
      temporaryUsername.value = target.username;
      temporaryPassword.value =
        mapResetPasswordResult(result).temporaryPassword;
      temporaryTitle.value = t("users.passwordReset");
      tempOpen.value = true;
      resetTarget.value = null;
    },
  });
}

const roleTarget = ref<User | null>(null);
const roleOpen = ref(false);

function requestRole(user: User) {
  updateUser.reset();
  roleTarget.value = user;
  roleOpen.value = true;
}

function confirmRole(role: UserRole) {
  const target = roleTarget.value;
  if (!target) return;
  updateUser.mutate(
    { id: target.id, role },
    {
      onSuccess: () => {
        roleOpen.value = false;
        roleTarget.value = null;
      },
    },
  );
}

const toggleTarget = ref<User | null>(null);
const toggleOpen = ref(false);

const toggleDescription = computed(() => {
  const target = toggleTarget.value;
  if (!target) return "";
  return target.isActive
    ? t("users.deactivateDescription", { username: target.username })
    : t("users.reactivateDescription", { username: target.username });
});

function requestToggle(user: User) {
  updateUser.reset();
  toggleTarget.value = user;
  toggleOpen.value = true;
}

function confirmToggle() {
  const target = toggleTarget.value;
  if (!target) return;
  updateUser.mutate(
    { id: target.id, isActive: !target.isActive },
    {
      onSuccess: () => {
        toggleOpen.value = false;
        toggleTarget.value = null;
      },
    },
  );
}

function absoluteTime(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatDateTime(date);
}

function statusLabel(user: User): string {
  return user.isActive ? t("users.active") : t("users.inactive");
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.usersView">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t("users.title") }}
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ t("users.subtitle") }}
        </p>
      </div>
      <Button
        type="button"
        :data-testid="TEST_ID.userCreate"
        @click="openCreate"
      >
        {{ t("users.newUser") }}
      </Button>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('users.errorTitle')"
      :retry="refetch"
      :empty="users.length === 0"
      :empty-title="t('users.emptyTitle')"
      :empty-description="t('users.emptyDescription')"
    >
      <template #loading>
        <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div
            v-for="row in 3"
            :key="row"
            class="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div class="space-y-2">
              <div class="h-4 w-32 animate-pulse rounded bg-muted" />
              <div class="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div class="h-8 w-8 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="relative w-full sm:max-w-xs">
            <Search
              class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              v-model="search"
              type="search"
              class="pl-9"
              :placeholder="t('users.searchPlaceholder')"
              :aria-label="t('users.searchLabel')"
              :data-testid="TEST_ID.userSearch"
            />
          </div>
          <p
            class="text-sm text-muted-foreground"
            :data-testid="TEST_ID.userCount"
          >
            {{
              search.trim()
                ? t("users.countFiltered", {
                    visible: visibleUsers.length,
                    total: users.length,
                  })
                : t("users.count", { count: users.length })
            }}
          </p>
        </div>

        <div
          v-if="visibleUsers.length === 0"
          class="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground"
          :data-testid="TEST_ID.userNoMatches"
        >
          {{ t("users.noMatches", { query: search.trim() }) }}
        </div>

        <div
          v-else-if="isDesktop"
          class="overflow-hidden rounded-xl border bg-card shadow-sm"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ t("users.user") }}</TableHead>
                <TableHead class="w-28">{{ t("users.role") }}</TableHead>
                <TableHead class="w-32">{{ t("users.status") }}</TableHead>
                <TableHead class="hidden w-44 xl:table-cell">{{
                  t("users.created")
                }}</TableHead>
                <TableHead class="w-12">
                  <span class="sr-only">{{ t("users.actions") }}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="user in visibleUsers"
                :key="user.id"
                :data-testid="TEST_ID.userRow"
              >
                <TableCell>
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate font-medium" :title="user.username">
                      {{ user.username }}
                    </span>
                    <Badge
                      v-if="isSelf(user)"
                      variant="outline"
                      class="shrink-0 text-[10px]"
                      :data-testid="TEST_ID.userSelf"
                    >
                      {{ t("users.you") }}
                    </Badge>
                    <Badge
                      v-if="user.mustChangePassword"
                      variant="secondary"
                      class="shrink-0 text-[10px]"
                    >
                      {{ t("users.mustChangePassword") }}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    :variant="ROLE_BADGE_VARIANT[user.role]"
                    :data-testid="TEST_ID.userRole"
                  >
                    {{ user.role }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span class="inline-flex items-center gap-1.5 text-sm">
                    <span
                      class="size-1.5 shrink-0 rounded-full"
                      :class="
                        user.isActive
                          ? 'bg-status-success'
                          : 'bg-muted-foreground'
                      "
                      aria-hidden="true"
                    />
                    <span
                      :class="user.isActive ? '' : 'text-muted-foreground'"
                      :data-testid="TEST_ID.userActive"
                    >
                      {{ statusLabel(user) }}
                    </span>
                  </span>
                </TableCell>
                <TableCell class="hidden xl:table-cell">
                  <div class="min-w-0 text-sm">
                    <p v-if="user.createdBy" class="truncate">
                      {{ t("users.createdBy", { username: user.createdBy }) }}
                    </p>
                    <p
                      class="text-xs text-muted-foreground"
                      :title="absoluteTime(user.createdAt)"
                    >
                      {{ formatRelativeAge(user.createdAt) }}
                    </p>
                  </div>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end">
                    <UserRowActions
                      :user="user"
                      :blocked="blockedFor(user)"
                      @reset="requestReset(user)"
                      @change-role="requestRole(user)"
                      @toggle="requestToggle(user)"
                    />
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <ul v-else class="space-y-3">
          <li
            v-for="user in visibleUsers"
            :key="user.id"
            class="rounded-xl border bg-card p-4 shadow-sm"
            :data-testid="TEST_ID.userRow"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="truncate font-medium" :title="user.username">
                    {{ user.username }}
                  </span>
                  <Badge
                    v-if="isSelf(user)"
                    variant="outline"
                    class="text-[10px]"
                    :data-testid="TEST_ID.userSelf"
                  >
                    {{ t("users.you") }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground">
                  <template v-if="user.createdBy">
                    {{ t("users.createdBy", { username: user.createdBy }) }} ·
                  </template>
                  <span :title="absoluteTime(user.createdAt)">
                    {{ formatRelativeAge(user.createdAt) }}
                  </span>
                </p>
              </div>
              <UserRowActions
                :user="user"
                :blocked="blockedFor(user)"
                @reset="requestReset(user)"
                @change-role="requestRole(user)"
                @toggle="requestToggle(user)"
              />
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                :variant="ROLE_BADGE_VARIANT[user.role]"
                :data-testid="TEST_ID.userRole"
              >
                {{ user.role }}
              </Badge>
              <span class="inline-flex items-center gap-1.5 text-sm">
                <span
                  class="size-1.5 shrink-0 rounded-full"
                  :class="
                    user.isActive ? 'bg-status-success' : 'bg-muted-foreground'
                  "
                  aria-hidden="true"
                />
                <span
                  :class="user.isActive ? '' : 'text-muted-foreground'"
                  :data-testid="TEST_ID.userActive"
                >
                  {{ statusLabel(user) }}
                </span>
              </span>
              <Badge
                v-if="user.mustChangePassword"
                variant="secondary"
                class="text-[10px]"
              >
                {{ t("users.mustChangePassword") }}
              </Badge>
            </div>
          </li>
        </ul>
      </div>
    </AsyncState>

    <CreateUserDialog
      :open="createOpen"
      :pending="createUser.isPending.value"
      @update:open="createOpen = $event"
      @submit="submitCreate"
    />

    <TemporaryPasswordDialog
      :open="tempOpen"
      :title="temporaryTitle"
      :username="temporaryUsername"
      :password="temporaryPassword"
      @update:open="tempOpen = $event"
    />

    <ConfirmDialog
      :open="resetOpen"
      :pending="resetPassword.isPending.value"
      :title="t('users.resetTitle')"
      :description="
        t('users.resetDescription', {
          username: resetTarget?.username ?? t('users.thisUser'),
        })
      "
      :confirm-text="t('users.resetPassword')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmReset"
      @cancel="resetOpen = false"
      @update:open="resetOpen = $event"
    />

    <ChangeUserRoleDialog
      :open="roleOpen"
      :user="roleTarget"
      :pending="updateUser.isPending.value"
      @update:open="roleOpen = $event"
      @submit="confirmRole"
    />

    <ConfirmDialog
      :open="toggleOpen"
      :pending="updateUser.isPending.value"
      :title="t('users.toggleTitle')"
      :description="toggleDescription"
      :confirm-text="
        toggleTarget?.isActive ? t('users.deactivate') : t('users.reactivate')
      "
      :confirm-variant="toggleTarget?.isActive ? 'destructive' : 'default'"
      :cancel-text="t('common.cancel')"
      @confirm="confirmToggle"
      @cancel="toggleOpen = false"
      @update:open="toggleOpen = $event"
    />
  </div>
</template>
