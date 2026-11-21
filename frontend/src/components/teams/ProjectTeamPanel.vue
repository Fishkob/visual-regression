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

// "Shared" is a real, visible state, not an empty dropdown: an untagged project
// is visible to everyone (ADR-082), and an operator has to be able to see that
// and to put the project back into it.
const SHARED = "__shared__";

// Admin-only surface, mounted by the settings page behind `isAdmin`: the team
// read is an ADMIN route, and ownership does not change anything a MEMBER can do
// yet (the scoping it implies is a later step).
const props = defineProps<{ projectName: string }>();

const { t } = useI18n();
const { data: teams, isLoading, error, refetch } = useTeamsQuery();
const assign = useAssignProjectTeam();

const owner = computed(() =>
  teamOfProject(teams.value ?? [], props.projectName),
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
    :data-testid="TEST_ID.projectTeamSection"
  >
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 class="font-medium">{{ t("projectTeam.title") }}</h3>
        <p class="max-w-2xl text-sm text-muted-foreground">
          {{ t("projectTeam.description") }}
        </p>
      </div>
      <p class="text-sm font-medium" :data-testid="TEST_ID.projectTeamCurrent">
        {{
          owner
            ? t("projectTeam.owner", { name: owner.name })
            : t("projectTeam.shared")
        }}
      </p>
    </div>

    <div class="mt-4 space-y-3">
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
              <SelectItem v-for="team in teams" :key="team.id" :value="team.id">
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
          {{ sdkErrorMessage(assign.error.value, t("projectTeam.saveError")) }}
        </p>
      </template>
    </div>
  </section>
</template>
