<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAllProjectsQuery } from "@/composables/useProjects";
import type { Team } from "@/domains/teams/team.model";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

// Ownership is edited where ownership lives (ADR-084 decision 5): the Teams page
// is the place where a team's projects are read and changed. "Remove" cannot
// mean "unassign" — a project always has an owner (ADR-083) — so removing a
// project from a team hands it to another one, in the same write the settings
// page uses.
const props = defineProps<{
  open: boolean;
  team?: Team | null;
  teams: readonly Team[];
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "assign", payload: { projectName: string; teamId: string }): void;
}>();

const { t } = useI18n();
const {
  data: projects,
  isLoading,
  error: projectsError,
} = useAllProjectsQuery();

const owned = computed(() =>
  (projects.value ?? []).filter((project) => project.teamId === props.team?.id),
);
// Only the projects another team owns are candidates for "move here"; the ones
// this team already has are listed above them.
const movable = computed(() =>
  (projects.value ?? []).filter((project) => project.teamId !== props.team?.id),
);
const otherTeams = computed(() =>
  props.teams.filter((entry) => entry.id !== props.team?.id),
);

const target = ref("");
const moveTo = ref<Record<string, string>>({});

watch(
  () => [props.open, props.team?.id],
  () => {
    target.value = "";
    moveTo.value = {};
  },
);

const canAdd = computed(() => target.value !== "" && !props.pending);

function addProject() {
  if (!canAdd.value) return;
  emit("assign", { projectName: target.value, teamId: props.team?.id ?? "" });
}

function moveProject(projectName: string) {
  const teamId = moveTo.value[projectName];
  if (!teamId) return;
  emit("assign", { projectName, teamId });
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-overlay/80" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg"
        :data-testid="TEST_ID.teamProjectsDialog"
      >
        <div class="flex flex-col gap-2">
          <DialogTitle class="text-lg font-semibold">
            {{ t("teamProjects.title", { name: team?.name ?? "" }) }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ t("teamProjects.description") }}
          </DialogDescription>
        </div>

        <div class="space-y-4">
          <p v-if="isLoading" class="text-sm text-muted-foreground">
            {{ t("common.loading") }}
          </p>
          <p
            v-else-if="projectsError"
            class="text-sm text-destructive"
            role="alert"
          >
            {{ sdkErrorMessage(projectsError, t("teamProjects.loadError")) }}
          </p>
          <template v-else>
            <section class="space-y-2">
              <h3 class="text-sm font-medium">{{ t("teamProjects.owned") }}</h3>
              <p
                v-if="owned.length === 0"
                class="text-sm text-muted-foreground"
                :data-testid="TEST_ID.teamProjectsEmpty"
              >
                {{ t("teamProjects.empty") }}
              </p>
              <ul class="divide-y rounded-md border">
                <li
                  v-for="project in owned"
                  :key="project.id"
                  class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  :data-testid="TEST_ID.teamProjectsCurrent"
                >
                  <span class="text-sm">{{ project.name }}</span>
                  <div class="flex items-center gap-2">
                    <Select
                      :model-value="moveTo[project.name]"
                      @update:model-value="
                        moveTo = { ...moveTo, [project.name]: String($event) }
                      "
                    >
                      <SelectTrigger
                        class="w-40"
                        :aria-label="
                          t('teamProjects.moveAria', { project: project.name })
                        "
                        :data-testid="TEST_ID.teamProjectsMoveSelect"
                      >
                        <SelectValue :placeholder="t('teamProjects.moveTo')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="entry in otherTeams"
                          :key="entry.id"
                          :value="entry.id"
                        >
                          {{ entry.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      :disabled="!moveTo[project.name] || pending"
                      :data-testid="TEST_ID.teamProjectsMove"
                      @click="moveProject(project.name)"
                    >
                      {{ t("teamProjects.move") }}
                    </Button>
                  </div>
                </li>
              </ul>
            </section>

            <section class="space-y-2">
              <h3 class="text-sm font-medium">{{ t("teamProjects.add") }}</h3>
              <div class="flex flex-wrap items-end gap-2">
                <Select v-model="target">
                  <SelectTrigger
                    class="w-56"
                    :aria-label="t('teamProjects.addAria')"
                    :data-testid="TEST_ID.teamProjectsAddSelect"
                  >
                    <SelectValue :placeholder="t('teamProjects.pickProject')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="project in movable"
                      :key="project.id"
                      :value="project.name"
                    >
                      {{ project.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  :disabled="!canAdd"
                  :data-testid="TEST_ID.teamProjectsAddSubmit"
                  @click="addProject"
                >
                  {{ t("teamProjects.addAction") }}
                </Button>
              </div>
            </section>
          </template>

          <p v-if="error" class="text-sm text-destructive" role="alert">
            {{ sdkErrorMessage(error, t("teamProjects.assignError")) }}
          </p>
        </div>

        <div class="flex justify-end">
          <DialogClose as-child>
            <Button type="button" variant="outline">
              {{ t("common.close") }}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
