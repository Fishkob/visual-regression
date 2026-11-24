<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FormDialog from "@/components/FormDialog.vue";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import type { TeamChoice } from "@/domains/teams/team.model";

// A project always has an owner (ADR-083), so the dialog asks for it. The team
// options are the caller's own teams for a MEMBER (the API only accepts those)
// and every team for an ADMIN; the first one is preselected, which is the same
// order the API falls back to when no team is sent at all.
const props = defineProps<{
  open: boolean;
  teams: TeamChoice[];
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: { name: string; teamId: string }): void;
}>();

const { t } = useI18n();
const name = ref("");
const teamId = ref("");
const invalid = computed(() => !name.value.trim());
const teamMissing = computed(() => props.teams.length === 0);

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = "";
      teamId.value = props.teams[0]?.id ?? "";
    }
  },
);

// A team list that arrives after the dialog opened (a slow query) still has to
// preselect the first one — an empty select would silently block the form.
watch(
  () => props.teams,
  (teams) => {
    if (!props.open || teamId.value) return;
    teamId.value = teams[0]?.id ?? "";
  },
);

function submit() {
  if (invalid.value || teamMissing.value) return;
  emit("submit", { name: name.value.trim(), teamId: teamId.value });
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('newProject.title')"
    :description="t('newProject.description')"
    :pending="pending"
    :submit-disabled="invalid || teamMissing"
    :confirm-test-id="TEST_ID.projectFormSubmit"
    :confirm-text="t('newProject.create')"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>{{ t("newProject.name") }}</span>
      <Input
        v-model="name"
        :data-testid="TEST_ID.projectNameInput"
        :aria-invalid="invalid || undefined"
      />
    </label>
    <p v-if="invalid" class="text-sm text-muted-foreground" role="alert">
      {{ t("newProject.nameRequired") }}
    </p>
    <label class="block space-y-1 text-sm">
      <span>{{ t("newProject.team") }}</span>
      <Select v-model="teamId" :disabled="teamMissing">
        <SelectTrigger :data-testid="TEST_ID.newProjectTeam">
          <SelectValue :placeholder="t('newProject.team')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="team in teams" :key="team.id" :value="team.id">
            {{ team.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
    <p
      v-if="teamMissing"
      class="text-sm text-muted-foreground"
      role="alert"
      :data-testid="TEST_ID.newProjectNoTeam"
    >
      {{ t("newProject.noTeam") }}
    </p>
    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, t("newProject.createError")) }}
    </p>
  </FormDialog>
</template>
