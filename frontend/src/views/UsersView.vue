<script setup lang="ts">
import { computed, ref } from "vue";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import CreateUserDialog from "@/components/users/CreateUserDialog.vue";
import TemporaryPasswordDialog from "@/components/users/TemporaryPasswordDialog.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const { data, isLoading, error, refetch } = useUsersQuery();
const createUser = useCreateUser();
const updateUser = useUpdateUser();
const resetPassword = useResetUserPassword();

const users = computed(() => data.value ?? []);

const createOpen = ref(false);
const tempOpen = ref(false);
const temporaryPassword = ref("");
const temporaryUsername = ref("");
const temporaryTitle = ref("User created");

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
      temporaryTitle.value = "User created";
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
      temporaryTitle.value = "Password reset";
      tempOpen.value = true;
      resetTarget.value = null;
    },
  });
}

const toggleTarget = ref<User | null>(null);
const toggleOpen = ref(false);

const toggleDescription = computed(() => {
  const target = toggleTarget.value;
  if (!target) return "";
  return target.isActive
    ? `Deactivating ${target.username} ends their sessions and blocks new sign-ins. Their reviews and audit trail stay intact.`
    : `Reactivating ${target.username} lets them sign in again with their current password.`;
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
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.usersView">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Users</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Admins manage who can sign in and what they may do. New accounts get a
          temporary password they must replace at first sign-in.
        </p>
      </div>
      <Button
        type="button"
        :data-testid="TEST_ID.userCreate"
        @click="openCreate"
      >
        New user
      </Button>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load users"
      :retry="refetch"
      :empty="users.length === 0"
      empty-title="No users yet"
      empty-description="Create the first account to share this installation."
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
            <div class="flex gap-2">
              <div class="h-8 w-24 animate-pulse rounded-md bg-muted" />
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="user in users"
                :key="user.id"
                :data-testid="TEST_ID.userRow"
              >
                <TableCell>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-medium">{{ user.username }}</span>
                    <Badge v-if="user.mustChangePassword" variant="outline">
                      Must change password
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
                  <Badge
                    :variant="user.isActive ? 'default' : 'outline'"
                    :data-testid="TEST_ID.userActive"
                  >
                    {{ user.isActive ? "Active" : "Inactive" }}
                  </Badge>
                </TableCell>
                <TableCell class="text-sm">
                  <p v-if="user.createdBy">{{ user.createdBy }}</p>
                  <p class="text-muted-foreground">
                    <span :title="absoluteTime(user.createdAt)">
                      {{ formatRelativeAge(user.createdAt) }}
                    </span>
                  </p>
                </TableCell>
                <TableCell>
                  <div class="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      :aria-label="`Reset the password of ${user.username}`"
                      :data-testid="TEST_ID.userReset"
                      @click="requestReset(user)"
                    >
                      Reset password
                    </Button>
                    <Button
                      type="button"
                      :variant="user.isActive ? 'destructive' : 'outline'"
                      size="sm"
                      :aria-label="
                        user.isActive
                          ? `Deactivate ${user.username}`
                          : `Reactivate ${user.username}`
                      "
                      :data-testid="TEST_ID.userDeactivate"
                      @click="requestToggle(user)"
                    >
                      {{ user.isActive ? "Deactivate" : "Reactivate" }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
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
      title="Reset password"
      :description="`Resets the password of ${resetTarget?.username ?? 'this user'}. Their sessions end and the new temporary password must be changed at next sign-in.`"
      confirm-text="Reset password"
      cancel-text="Cancel"
      @confirm="confirmReset"
      @cancel="resetOpen = false"
      @update:open="resetOpen = $event"
    />

    <ConfirmDialog
      :open="toggleOpen"
      :pending="updateUser.isPending.value"
      title="Change user access"
      :description="toggleDescription"
      :confirm-text="toggleTarget?.isActive ? 'Deactivate' : 'Reactivate'"
      :confirm-variant="toggleTarget?.isActive ? 'destructive' : 'default'"
      cancel-text="Cancel"
      @confirm="confirmToggle"
      @cancel="toggleOpen = false"
      @update:open="toggleOpen = $event"
    />
  </div>
</template>
