<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  useTeamsQuery,
  useCreateTeam,
  useRenameTeam,
  useDeleteTeam,
  useReplaceTeamMembers,
} from "@/composables/useTeams";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TeamFormDialog from "@/components/teams/TeamFormDialog.vue";
import TeamMembersDialog from "@/components/teams/TeamMembersDialog.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import AsyncState from "@/components/AsyncState.vue";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { Team } from "@/domains/teams/team.model";

const { t } = useI18n();
const { data: teams, isLoading, error, refetch } = useTeamsQuery();
const createTeam = useCreateTeam();
const renameTeam = useRenameTeam();
const deleteTeam = useDeleteTeam();
const replaceMembers = useReplaceTeamMembers();

const formOpen = ref(false);
const editing = ref<Team | null>(null);
const membersOpen = ref(false);
const membersTeam = ref<Team | null>(null);
const deleteOpen = ref(false);
const pendingDelete = ref<Team | null>(null);

const formPending = computed(
  () => createTeam.isPending.value || renameTeam.isPending.value,
);
const formError = computed(() =>
  editing.value ? renameTeam.error.value : createTeam.error.value,
);
const deletePending = computed(() => deleteTeam.isPending.value);
// The refusal is the API's to state (it names the team and the project count),
// so the banner shows that answer instead of a generic "failed" the operator
// could not act on.
const deleteErrorText = computed(() =>
  deleteTeam.error.value
    ? sdkErrorMessage(deleteTeam.error.value, t("teams.deleteErrorFallback"))
    : "",
);

function openCreate() {
  createTeam.reset();
  renameTeam.reset();
  editing.value = null;
  formOpen.value = true;
}
function openRename(team: Team) {
  createTeam.reset();
  renameTeam.reset();
  editing.value = team;
  formOpen.value = true;
}
function submit(name: string) {
  if (!name) return;
  const close = { onSuccess: () => (formOpen.value = false) };
  if (editing.value) {
    renameTeam.mutate({ id: editing.value.id, name }, close);
  } else {
    createTeam.mutate({ name }, close);
  }
}
function openMembers(team: Team) {
  replaceMembers.reset();
  membersTeam.value = team;
  membersOpen.value = true;
}
function submitMembers(userIds: string[]) {
  if (!membersTeam.value) return;
  replaceMembers.mutate(
    { id: membersTeam.value.id, userIds },
    { onSuccess: () => (membersOpen.value = false) },
  );
}
function requestDelete(team: Team) {
  deleteTeam.reset();
  pendingDelete.value = team;
  deleteOpen.value = true;
}
function cancelDelete() {
  pendingDelete.value = null;
  deleteOpen.value = false;
}
function onDeleteOpenChange(open: boolean) {
  // Do not clear the target here: reka-ui closes the alert dialog before the
  // action's click handler runs, so clearing on close left confirmDelete with
  // no team to delete. cancelDelete() and onSuccess own the reset instead.
  deleteOpen.value = open;
}
function confirmDelete() {
  if (!pendingDelete.value) return;
  deleteTeam.mutate(pendingDelete.value.id, {
    onSuccess: () => {
      deleteOpen.value = false;
      pendingDelete.value = null;
    },
  });
}

function memberNames(team: Team): string {
  return team.members.map((member) => member.username).join(", ");
}
function projectNames(team: Team): string {
  return team.projects.map((project) => project.name).join(", ");
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.teamsView">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-xl font-semibold tracking-tight">
            {{ t("teams.title") }}
          </h1>
          <Badge variant="outline">{{ t("teams.axisBadge") }}</Badge>
        </div>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ t("teams.subtitle") }}
        </p>
      </div>
      <Button type="button" :data-testid="TEST_ID.newTeam" @click="openCreate">
        {{ t("teams.newTeam") }}
      </Button>
    </div>

    <div
      v-if="deleteErrorText"
      class="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      role="alert"
      :data-testid="TEST_ID.teamDeleteError"
    >
      <p class="font-medium">{{ t("teams.deleteFailedTitle") }}</p>
      <p>{{ deleteErrorText }}</p>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('teams.errorTitle')"
      :retry="refetch"
      :empty="(teams ?? []).length === 0"
      :empty-title="t('teams.emptyTitle')"
      :empty-description="t('teams.emptyDescription')"
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
              <div class="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div class="flex gap-2">
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
              <div class="h-8 w-20 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </template>

      <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          v-for="team in teams"
          :key="team.id"
          class="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
          :data-testid="TEST_ID.teamRow"
        >
          <div class="min-w-0">
            <p class="font-medium">{{ team.name }}</p>
            <p
              class="text-sm text-muted-foreground"
              :data-testid="TEST_ID.teamMemberCount"
            >
              {{ t("teams.memberCount", team.members.length) }}
              <template v-if="team.members.length">
                · {{ memberNames(team) }}
              </template>
            </p>
            <p
              class="text-sm text-muted-foreground"
              :data-testid="TEST_ID.teamProjects"
            >
              {{
                team.projects.length
                  ? t("teams.projectNames", { projects: projectNames(team) })
                  : t("teams.noProjects")
              }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :aria-label="t('teams.membersAria', { name: team.name })"
              :data-testid="TEST_ID.teamMembers"
              @click="openMembers(team)"
            >
              {{ t("teams.members") }}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :aria-label="t('teams.renameAria', { name: team.name })"
              :data-testid="TEST_ID.teamRename"
              @click="openRename(team)"
            >
              {{ t("teams.rename") }}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              :aria-label="t('teams.deleteAria', { name: team.name })"
              :data-testid="TEST_ID.teamDelete"
              @click="requestDelete(team)"
            >
              {{ t("teams.delete") }}
            </Button>
          </div>
        </div>
      </div>
    </AsyncState>

    <TeamFormDialog
      v-model:open="formOpen"
      :team="editing"
      :pending="formPending"
      :error="formError"
      @submit="submit"
    />

    <TeamMembersDialog
      v-model:open="membersOpen"
      :team="membersTeam"
      :pending="replaceMembers.isPending.value"
      :error="replaceMembers.error.value"
      @submit="submitMembers"
    />

    <ConfirmDialog
      :open="deleteOpen"
      :pending="deletePending"
      confirm-variant="destructive"
      :title="t('teams.deleteTitle')"
      :confirm-text="t('teams.delete')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
      @update:open="onDeleteOpenChange"
    >
      <template #description>
        {{ t("teams.deleteDescription") }}
      </template>
    </ConfirmDialog>
  </div>
</template>
