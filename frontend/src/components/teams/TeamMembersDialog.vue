<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FormDialog from "@/components/FormDialog.vue";
import { useUsersQuery } from "@/composables/useUsers";
import { ROLE_BADGE_VARIANT } from "@/domains/auth/auth.model";
import type { Team } from "@/domains/teams/team.model";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  team?: Team | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", userIds: string[]): void;
}>();

const { t } = useI18n();
const { data: users, isLoading, error: usersError, refetch } = useUsersQuery();
const selected = ref<string[]>([]);

watch(
  () => props.open,
  (open) => {
    if (open) {
      selected.value = (props.team?.members ?? []).map(
        (member) => member.userId,
      );
    }
  },
  { immediate: true },
);

const sortedUsers = computed(() =>
  [...(users.value ?? [])].sort((a, b) => a.username.localeCompare(b.username)),
);
// A team is a set of people: with the admin's account as the only one there is
// nobody to assign, and an empty checkbox list would read like a broken query.
const onlyOneAccount = computed(
  () => !isLoading.value && !usersError.value && sortedUsers.value.length <= 1,
);
const canSave = computed(
  () => !onlyOneAccount.value && usersError.value === null,
);
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('teamMembers.title', { name: team?.name ?? '' })"
    :description="t('teamMembers.description')"
    :pending="pending"
    :submit-disabled="!canSave"
    :confirm-test-id="TEST_ID.teamMembersSubmit"
    @update:open="emit('update:open', $event)"
    @submit="emit('submit', [...selected])"
  >
    <div class="space-y-3" :data-testid="TEST_ID.teamMembersDialog">
      <p v-if="isLoading" class="text-sm text-muted-foreground">
        {{ t("common.loading") }}
      </p>
      <div
        v-else-if="usersError"
        class="space-y-2 text-sm text-destructive"
        role="alert"
      >
        <p>{{ sdkErrorMessage(usersError, t("teamMembers.loadError")) }}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :data-testid="TEST_ID.retry"
          @click="refetch()"
        >
          {{ t("common.retry") }}
        </Button>
      </div>
      <div
        v-else-if="onlyOneAccount"
        class="space-y-1 text-sm"
        :data-testid="TEST_ID.teamMembersEmpty"
      >
        <p class="font-medium">{{ t("teamMembers.emptyTitle") }}</p>
        <p class="text-muted-foreground">
          {{ t("teamMembers.emptyDescription") }}
        </p>
      </div>
      <fieldset
        v-else
        class="max-h-64 space-y-2 overflow-y-auto"
        :data-testid="TEST_ID.teamMembersList"
      >
        <legend class="pb-1 text-sm">{{ t("teamMembers.legend") }}</legend>
        <label
          v-for="user in sortedUsers"
          :key="user.id"
          class="flex items-center gap-2 text-sm"
          :data-testid="TEST_ID.teamMemberOption"
        >
          <input
            v-model="selected"
            type="checkbox"
            :value="user.id"
            class="h-4 w-4 rounded border-input accent-primary"
            :data-testid="TEST_ID.teamMemberCheckbox"
          />
          <span class="truncate">{{ user.username }}</span>
          <Badge :variant="ROLE_BADGE_VARIANT[user.role]" class="ml-auto">
            {{ user.role }}
          </Badge>
        </label>
      </fieldset>
      <p v-if="error" class="text-sm text-destructive" role="alert">
        {{ sdkErrorMessage(error, t("teamMembers.saveError")) }}
      </p>
    </div>
  </FormDialog>
</template>
