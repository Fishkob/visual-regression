<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Input } from "@/components/ui/input";
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
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: { username: string; role: UserRole }): void;
}>();

const { t } = useI18n();
const username = ref("");
const role = ref<UserRole>(DEFAULT_ROLE);

const invalid = computed(() => !username.value.trim());

// Reopening starts from a blank form, so a cancelled attempt never leaks into
// the next create.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    username.value = "";
    role.value = DEFAULT_ROLE;
  },
);

function submit() {
  if (invalid.value) return;
  emit("submit", { username: username.value.trim(), role: role.value });
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('createUser.title')"
    :description="t('createUser.description')"
    :confirm-text="t('createUser.confirm')"
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.createUserSubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>{{ t("createUser.username") }}</span>
      <Input
        v-model="username"
        placeholder="jane.doe"
        :aria-invalid="invalid"
        :data-testid="TEST_ID.createUserUsername"
      />
    </label>

    <label class="block space-y-1 text-sm">
      <span>{{ t("createUser.role") }}</span>
      <Select v-model="role">
        <SelectTrigger class="w-full" :data-testid="TEST_ID.createUserRole">
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
  </FormDialog>
</template>
