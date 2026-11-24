<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssignProjectTeam, useTeamsQuery } from "@/composables/useTeams";
import { teamOfProject } from "@/domains/teams/team.mapper";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

// A project sits on two axes, and this is the one place that shows both: the
// group is a navigation label, the team decides who may open the project. They
// used to live on different pages — the group only on the project list, the team
// only here behind `isAdmin` — so "where does this belong, and why do I see it"
// had no single answer (and a MEMBER could not answer the second half at all).
//
// Naming the owner is not administering it: the team name rides on the project
// read for every principal that may open the project, while the assignment stays
// ADMIN-only (`PATCH /projects/:projectName/team`, ADR-082).
const SHARED = "__shared__";

const props = defineProps<{
  projectName: string;
  groupName: string | null;
  teamName: string | null;
  canManageTeam: boolean;
}>();

const { t } = useI18n();
// The team read is an ADMIN route, so a MEMBER never asks for it: the team name
// it needs already came with the project.
const manageTeam = computed(() => props.canManageTeam);
const { data: teams, isLoading, error, refetch } = useTeamsQuery(manageTeam);
const assign = useAssignProjectTeam();

const owner = computed(() =>
  props.canManageTeam
    ? teamOfProject(teams.value ?? [], props.projectName)
    : null,
);
const selected = ref(SHARED);

watch(
  owner,
  (team) => {
    selected.value = team?.id ?? SHARED;
  },
  { immediate: true },
);

const isDirty = computed(() => selected.value !== (owner.value?.id ?? SHARED));

// The admin reads the answer off the team list it already has (so a save
// refreshes it); everybody else reads it off the project payload.
const teamLabel = computed(() => {
  if (props.canManageTeam) {
    return owner.value?.name ?? t("projectTeam.shared");
  }
  return props.teamName ?? t("projectTeam.shared");
});

function save() {
  assign.mutate({
    projectName: props.projectName,
    teamId: selected.value === SHARED ? null : selected.value,
  });
}
</script>

<template>
  <section
    class="rounded-xl border bg-card p-4 shadow-sm"
    :data-testid="TEST_ID.projectAffiliationSection"
  >
    <div>
      <h3 class="font-medium">{{ t("projectAffiliation.title") }}</h3>
      <p class="max-w-2xl text-sm text-muted-foreground">
        {{ t("projectAffiliation.description") }}
      </p>
    </div>

    <div class="mt-4 divide-y">
      <div
        class="flex flex-wrap items-start justify-between gap-4 py-3 first:pt-0"
        :data-testid="TEST_ID.projectAffiliationGroupRow"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">
            {{ t("projectAffiliation.groupLabel") }}
          </p>
          <p class="max-w-2xl text-sm text-muted-foreground">
            {{ t("projectAffiliation.groupHint") }}
          </p>
        </div>
        <p
          class="text-sm font-medium"
          :data-testid="TEST_ID.projectAffiliationGroup"
        >
          {{ groupName || t("projectAffiliation.groupUnassigned") }}
        </p>
      </div>

      <div
        class="space-y-3 py-3 last:pb-0"
        :data-testid="TEST_ID.projectTeamSection"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm font-medium">
              {{ t("projectAffiliation.teamLabel") }}
            </p>
            <p class="max-w-2xl text-sm text-muted-foreground">
              {{ t("projectAffiliation.teamHint") }}
            </p>
          </div>
          <p
            class="text-sm font-medium"
            :data-testid="TEST_ID.projectTeamCurrent"
          >
            {{ teamLabel }}
          </p>
        </div>

        <template v-if="canManageTeam">
          <p v-if="isLoading" class="text-sm text-muted-foreground">
            {{ t("projectTeam.loading") }}
          </p>
          <div
            v-else-if="error"
            class="flex flex-wrap items-center gap-3 text-sm text-destructive"
            role="alert"
          >
            <span>{{ sdkErrorMessage(error, t("projectTeam.error")) }}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :data-testid="TEST_ID.projectTeamRetry"
              @click="refetch()"
            >
              {{ t("common.retry") }}
            </Button>
          </div>
          <template v-else>
            <label class="block max-w-sm space-y-1 text-sm">
              <span>{{ t("projectTeam.selectLabel") }}</span>
              <Select v-model="selected">
                <SelectTrigger :data-testid="TEST_ID.projectTeamSelect">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="SHARED">
                    {{ t("projectTeam.sharedOption") }}
                  </SelectItem>
                  <SelectItem
                    v-for="team in teams"
                    :key="team.id"
                    :value="team.id"
                  >
                    {{ team.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button
              type="button"
              size="sm"
              :disabled="!isDirty || assign.isPending.value"
              :data-testid="TEST_ID.projectTeamSave"
              @click="save"
            >
              {{ t("projectTeam.save") }}
            </Button>
            <p
              v-if="assign.error.value"
              class="text-sm text-destructive"
              role="alert"
            >
              {{
                sdkErrorMessage(assign.error.value, t("projectTeam.saveError"))
              }}
            </p>
          </template>
        </template>
      </div>
    </div>
  </section>
</template>
