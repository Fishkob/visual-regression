<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  KeyRound,
  MoreVertical,
  ShieldCheck,
  UserCheck,
  UserX,
} from "@lucide/vue";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/domains/users/user.model";
import { TEST_ID } from "@/lib/test-ids";

// The row's single action surface. Two always-visible buttons per row turned the
// list into a wall of red, and on a phone the action column fell outside the
// viewport. One menu keeps the destructive item red and states the reason next
// to it when it is unavailable — a disabled item without its reason is the
// greyed-out mystery the branch menu already avoids.
const props = defineProps<{
  user: User;
  /** Why an action is unavailable, per action. Empty = available. */
  blocked?: { reset?: string; role?: string; deactivate?: string };
}>();

const emit = defineEmits<{
  reset: [];
  changeRole: [];
  toggle: [];
}>();

const { t } = useI18n();
const open = ref(false);

const blocked = computed(() => props.blocked ?? {});
const reasons = computed(() =>
  [blocked.value.reset, blocked.value.role, blocked.value.deactivate].filter(
    (reason): reason is string => Boolean(reason),
  ),
);

function selectReset() {
  open.value = false;
  emit("reset");
}

function selectChangeRole() {
  open.value = false;
  emit("changeRole");
}

function selectToggle() {
  open.value = false;
  emit("toggle");
}
</script>

<template>
  <DropdownMenu v-model:open="open">
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="shrink-0"
        :aria-label="t('users.actionsFor', { username: user.username })"
        :data-testid="TEST_ID.userActions"
      >
        <MoreVertical class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-60"
      @interact-outside="open = false"
    >
      <DropdownMenuItem
        class="cursor-pointer"
        :disabled="Boolean(blocked.reset)"
        :data-testid="TEST_ID.userReset"
        @click="selectReset"
      >
        <KeyRound />
        {{ t("users.resetPassword") }}
      </DropdownMenuItem>
      <DropdownMenuItem
        class="cursor-pointer"
        :disabled="Boolean(blocked.role)"
        :data-testid="TEST_ID.userChangeRole"
        @click="selectChangeRole"
      >
        <ShieldCheck />
        {{ t("users.changeRole") }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        class="cursor-pointer"
        :class="
          user.isActive ? 'text-status-danger focus:text-status-danger' : ''
        "
        :disabled="Boolean(blocked.deactivate)"
        :data-testid="TEST_ID.userDeactivate"
        @click="selectToggle"
      >
        <UserX v-if="user.isActive" />
        <UserCheck v-else />
        {{ user.isActive ? t("users.deactivate") : t("users.reactivate") }}
      </DropdownMenuItem>
      <ul
        v-if="reasons.length"
        class="space-y-1 border-t px-2 pb-1 pt-2 text-[11px] leading-snug text-muted-foreground"
        :data-testid="TEST_ID.userBlockedReason"
      >
        <li v-for="reason in reasons" :key="reason">{{ reason }}</li>
      </ul>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
