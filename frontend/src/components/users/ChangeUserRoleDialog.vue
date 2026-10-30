<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_ROLE,
  USER_ROLES,
  type UserRole,
} from "@/domains/auth/auth.model";
import type { User } from "@/domains/users/user.model";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  user: User | null;
  pending?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", role: UserRole): void;
}>();

const { t } = useI18n();
const role = ref<UserRole>(DEFAULT_ROLE);

// Reopening always starts from the account's current role, so a cancelled
// attempt cannot leak the next target's choice.
watch(
  () => props.open,
  (open) => {
    if (open && props.user) role.value = props.user.role;
  },
);

const unchanged = computed(() => !props.user || role.value === props.user.role);

function submit() {
  if (unchanged.value) return;
  emit("submit", role.value);
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('users.changeRoleTitle')"
    :description="
      user ? t('users.changeRoleDescription', { username: user.username }) : ''
    "
    :confirm-text="t('users.changeRoleConfirm')"
    :pending="pending"
    :submit-disabled="unchanged"
    :confirm-test-id="TEST_ID.changeRoleSubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div class="space-y-2">
      <label class="block space-y-1 text-sm">
        <span>{{ t("users.role") }}</span>
        <Select v-model="role">
          <SelectTrigger class="w-full" :data-testid="TEST_ID.changeRoleSelect">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in USER_ROLES"
              :key="option"
              :value="option"
            >
              {{ option }}
            </SelectItem>
          </SelectContent>
        </Select>
      </label>
      <p class="text-xs leading-snug text-muted-foreground">
        {{ t(`roles.${role}.description`) }}
      </p>
    </div>
  </FormDialog>
</template>
