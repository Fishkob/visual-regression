<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import BranchTargetDialog from "@/components/branches/BranchTargetDialog.vue";
import {
  Archive,
  ArchiveRestore,
  GitBranch,
  MoreVertical,
  Star,
  Trash2,
} from "@lucide/vue";
import type { ProjectBranch } from "@/domains/branches/branch.model";
import { TEST_ID } from "@/lib/test-ids";

// The branch switcher's overflow actions. The default branch is structural — it
// has no target and cannot be archived or deleted — so every lifecycle item
// disables for it, and the reason is stated instead of leaving a greyed-out
// mystery. Deletion is additionally blocked while other branches inherit from
// this one: re-pointing them silently is the automatic re-targeting the design
// rules out, and the API rejects it for the same reason.
const props = defineProps<{
  branch: ProjectBranch;
  pending?: boolean;
  /** Candidate targets for a retarget (non-archived siblings). */
  targets?: string[];
  /** Branches that explicitly inherit from this one. */
  dependentNames?: string[];
}>();

const emit = defineEmits<{
  archive: [isArchived: boolean];
  delete: [];
  setDefault: [];
  retarget: [targetBranch: string | null];
}>();

const { t } = useI18n();
const open = ref(false);
const confirmOpen = ref(false);
const targetOpen = ref(false);

const isDefault = computed(() => props.branch.isDefault);
const dependents = computed(() => props.dependentNames ?? []);
const canDelete = computed(
  () => !isDefault.value && dependents.value.length === 0,
);
const deleteBlockedReason = computed(() => {
  if (isDefault.value) return t("branchActions.deleteBlockedDefault");
  if (dependents.value.length === 1) {
    return t("branchActions.deleteBlockedOne", {
      branch: dependents.value[0],
    });
  }
  if (dependents.value.length > 1) {
    return t("branchActions.deleteBlockedMany", {
      count: dependents.value.length,
    });
  }
  return "";
});

function toggleArchive() {
  open.value = false;
  emit("archive", !props.branch.isArchived);
}

function requestDelete() {
  open.value = false;
  confirmOpen.value = true;
}

function confirmDelete() {
  confirmOpen.value = false;
  emit("delete");
}

function requestSetDefault() {
  open.value = false;
  emit("setDefault");
}

function requestTargetChange() {
  open.value = false;
  targetOpen.value = true;
}

function confirmTarget(target: string | null) {
  targetOpen.value = false;
  emit("retarget", target);
}
</script>

<template>
  <div class="flex items-center">
    <DropdownMenu v-model:open="open">
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          variant="outline"
          size="icon"
          :aria-label="t('branchActions.label')"
          :data-testid="TEST_ID.branchActionsButton"
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
          :disabled="isDefault || branch.isArchived"
          class="cursor-pointer"
          :data-testid="TEST_ID.branchSetDefault"
          @click="requestSetDefault"
        >
          <Star class="w-4 h-4 mr-2" />
          {{ t("branchActions.setDefault") }}
        </DropdownMenuItem>
        <DropdownMenuItem
          :disabled="isDefault"
          class="cursor-pointer"
          :data-testid="TEST_ID.branchChangeTarget"
          @click="requestTargetChange"
        >
          <GitBranch class="w-4 h-4 mr-2" />
          {{ t("branchActions.changeTarget") }}
          <span
            v-if="!isDefault && branch.targetBranchName"
            class="ml-auto pl-2 font-mono text-[10px] text-muted-foreground"
          >
            {{ branch.targetBranchName }}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          :disabled="isDefault"
          class="cursor-pointer"
          :data-testid="TEST_ID.branchArchive"
          @click="toggleArchive"
        >
          <ArchiveRestore v-if="branch.isArchived" class="w-4 h-4 mr-2" />
          <Archive v-else class="w-4 h-4 mr-2" />
          {{
            branch.isArchived
              ? t("branchActions.unarchive")
              : t("branchActions.archive")
          }}
        </DropdownMenuItem>
        <DropdownMenuItem
          :disabled="!canDelete"
          class="text-status-danger focus:text-status-danger cursor-pointer"
          :data-testid="TEST_ID.branchDelete"
          @click="requestDelete"
        >
          <Trash2 class="w-4 h-4 mr-2" />
          {{ t("branchActions.delete") }}
        </DropdownMenuItem>
        <p
          v-if="deleteBlockedReason"
          class="px-2 pb-1 pt-1 text-[11px] leading-snug text-muted-foreground"
          :data-testid="TEST_ID.branchDeleteBlocked"
        >
          {{ deleteBlockedReason }}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>

    <ConfirmDialog
      :open="confirmOpen"
      :pending="pending"
      confirm-variant="destructive"
      :title="t('branchActions.deleteTitle')"
      :confirm-text="t('branchActions.deleteConfirm')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmDelete"
      @cancel="confirmOpen = false"
      @update:open="confirmOpen = $event"
    >
      <template #description>
        {{ t("branchActions.deleteDescription", { branch: branch.name }) }}
      </template>
    </ConfirmDialog>

    <BranchTargetDialog
      :open="targetOpen"
      :branch-name="branch.name"
      :current-target="branch.targetBranchName"
      :targets="targets ?? []"
      :pending="pending"
      @update:open="targetOpen = $event"
      @confirm="confirmTarget"
    />
  </div>
</template>
