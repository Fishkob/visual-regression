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
import {
  useAssignProjectTeam,
  useSetProjectVisibility,
  useTeamsQuery,
} from "@/composables/useTeams";
import { teamOfProject } from "@/domains/teams/team.mapper";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

// Who owns the project and who may look at it (ADR-083). A project always has a
// team; "visible to everyone" is a separate flag on top of that owner, not the
// absence of one. The group row this section used to carry is gone with the
// concept (ADR-084): the owner is the only axis a project has.
//
// Naming the owner is not administering it: the team name rides on the project
// read for every principal that may open the project, while the assignment and
// the flag stay ADMIN-only (`PATCH /projects/:projectName/team` and `.../visibility`).
const props = defineProps<{
  projectName: string;
  teamId: string;
  teamName: string;
  isShared: boolean;
  canManageTeam: boolean;
}>();

const { t } = useI18n();
// The team read is an ADMIN route, so a MEMBER never asks for it: the team name
// it needs already came with the project.
const manageTeam = computed(() => props.canManageTeam);
const { data: teams, isLoading, error, refetch } = useTeamsQuery(manageTeam);
const assign = useAssignProjectTeam();
const visibility = useSetProjectVisibility();

// The admin reads the current owner off the team list it already has (so a save
// refreshes it); everybody else reads it off the project payload.
const owner = computed(() =>
  teamOfProject(teams.value ?? [], props.projectName),
);
// The payload is the fallback: a team list that is stale or still loading must
// not leave the select blank on a project that names its owner.
const currentTeamId = computed(() => owner.value?.id ?? props.teamId);
const selected = ref(props.teamId);
watch(
  currentTeamId,
  (teamId) => {
    selected.value = teamId;
  },
  { immediate: true },
);

const isDirty = computed(
  () => selected.value !== "" && selected.value !== currentTeamId.value,
);

// The list is authoritative for an ADMIN — it is what the select writes to, so a
// save refreshes the label instead of leaving the previous team on screen. Until
// it arrives (or when it is stale) the payload names the owner, which is the
// same value for everybody else.
const teamLabel = computed(() => owner.value?.name ?? props.teamName);

const shared = ref(props.isShared);
watch(
  () => props.isShared,
  (value) => {
    shared.value = value;
  },
);

function saveTeam() {
  if (!isDirty.value) return;
  assign.mutate({ projectName: props.projectName, teamId: selected.value });
}

function toggleShared() {
  const next = !shared.value;
  shared.value = next;
  visibility.mutate(
    { projectName: props.projectName, isShared: next },
    {
      // The payload is the truth; a failed write must not leave the control
      // claiming a state the server never accepted.
      onError: () => {
        shared.value = props.isShared;
      },
    },
  );
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

    <div class="mt-4">
      <div
        class="space-y-3 py-3 first:pt-0 last:pb-0"
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
                  <SelectItem
                    v-for="team in teams ?? []"
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
              @click="saveTeam"
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

            <div class="flex flex-wrap items-start gap-3 border-t pt-3">
              <input
                :id="`${TEST_ID.projectVisibilityToggle}-input`"
                type="checkbox"
                class="mt-0.5 h-4 w-4"
                :checked="shared"
                :disabled="visibility.isPending.value"
                :data-testid="TEST_ID.projectVisibilityToggle"
                @change="toggleShared"
              />
              <div class="min-w-0">
                <label
                  class="text-sm font-medium"
                  :for="`${TEST_ID.projectVisibilityToggle}-input`"
                >
                  {{ t("projectAffiliation.visibilityLabel") }}
                </label>
                <p class="max-w-2xl text-sm text-muted-foreground">
                  {{ t("projectAffiliation.visibilityHint") }}
                </p>
                <p
                  class="text-sm text-muted-foreground"
                  :data-testid="TEST_ID.projectVisibilityState"
                >
                  {{
                    shared
                      ? t("projectAffiliation.visibilityShared")
                      : t("projectAffiliation.visibilityTeamOnly")
                  }}
                </p>
                <p
                  v-if="visibility.error.value"
                  class="text-sm text-destructive"
                  role="alert"
                  :data-testid="TEST_ID.projectVisibilityError"
                >
                  {{
                    sdkErrorMessage(
                      visibility.error.value,
                      t("projectAffiliation.visibilityError"),
                    )
                  }}
                </p>
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>
  </section>
</template>
