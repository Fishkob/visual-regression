<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEST_ID } from "@/lib/test-ids";

// A branch's target decides where its unapproved baselines come from, so it is a
// product-facing setting — until this dialog existed the endpoint had no UI at
// all and every branch implicitly followed the project default.
const DEFAULT_TARGET = "__project_default__";

const props = defineProps<{
  open: boolean;
  branchName: string;
  currentTarget: string | null;
  targets: string[];
  pending?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm", target: string | null): void;
}>();

const { t } = useI18n();
const selected = ref(props.currentTarget ?? DEFAULT_TARGET);

watch(
  () => [props.open, props.currentTarget] as const,
  () => {
    selected.value = props.currentTarget ?? DEFAULT_TARGET;
  },
);

function confirm() {
  emit("confirm", selected.value === DEFAULT_TARGET ? null : selected.value);
}
</script>

<template>
  <AlertDialog :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogContent :data-testid="TEST_ID.branchTargetDialog">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("branchTarget.title") }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t("branchTarget.description", { branch: branchName }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <Select v-model="selected">
        <SelectTrigger
          :aria-label="t('branchTarget.label')"
          :data-testid="TEST_ID.branchTargetSelect"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="DEFAULT_TARGET">
            {{ t("branchTarget.projectDefault") }}
          </SelectItem>
          <SelectItem v-for="target in targets" :key="target" :value="target">
            {{ target }}
          </SelectItem>
        </SelectContent>
      </Select>

      <AlertDialogFooter>
        <AlertDialogCancel
          :data-testid="TEST_ID.branchTargetCancel"
          @click="emit('update:open', false)"
        >
          {{ t("branchTarget.cancel") }}
        </AlertDialogCancel>
        <AlertDialogAction
          :disabled="pending"
          :data-testid="TEST_ID.branchTargetConfirm"
          @click="confirm"
        >
          {{ t("branchTarget.save") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
