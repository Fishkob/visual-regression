<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import {
  bytesToMegabytes,
  megabytesToByteString,
  type ProjectStorage,
  type UpdateProjectStorageInput,
} from "@/domains/storage/storage.model";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  storage?: ProjectStorage | null;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: UpdateProjectStorageInput): void;
}>();

const quotaMb = ref("");
const baselineLimit = ref("");
const runHistoryDays = ref("");
const orphanGraceHours = ref("");
const softPercent = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    quotaMb.value =
      props.storage?.quotaBytes != null
        ? String(bytesToMegabytes(props.storage.quotaBytes))
        : "";
    baselineLimit.value =
      props.storage?.baselineRevisionLimit != null
        ? String(props.storage.baselineRevisionLimit)
        : "";
    runHistoryDays.value =
      props.storage?.runHistoryDays != null
        ? String(props.storage.runHistoryDays)
        : "";
    orphanGraceHours.value =
      props.storage?.orphanGraceHours != null
        ? String(props.storage.orphanGraceHours)
        : "";
    softPercent.value = String(props.storage?.softPercent ?? 80);
  },
);

// A number input can hand back a number (Vue Test Utils does, and some browser
// paths do too), so form values are normalized before validation instead of
// assuming the v-model always holds the typed string.
function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function optionalPositiveInteger(value: unknown): number | null {
  const trimmed = asText(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function optionalQuotaMegabytes(value: unknown): number | null {
  const trimmed = asText(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

const quota = computed(() => optionalQuotaMegabytes(quotaMb.value));
const baseline = computed(() => optionalPositiveInteger(baselineLimit.value));
const runDays = computed(() => optionalPositiveInteger(runHistoryDays.value));
const orphanHours = computed(() =>
  optionalPositiveInteger(orphanGraceHours.value),
);
const soft = computed(() => {
  const parsed = Number(asText(softPercent.value).trim());
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
    ? parsed
    : null;
});

const errors = computed(() => {
  const problems: string[] = [];
  if (asText(quotaMb.value).trim() && quota.value === null) {
    problems.push("Quota must be a positive number of MB.");
  }
  if (asText(baselineLimit.value).trim() && baseline.value === null) {
    problems.push("Baseline revisions must be a positive whole number.");
  }
  if (asText(runHistoryDays.value).trim() && runDays.value === null) {
    problems.push("Run history must be a positive whole number of days.");
  }
  if (asText(orphanGraceHours.value).trim() && orphanHours.value === null) {
    problems.push("Orphan grace must be a positive whole number of hours.");
  }
  if (soft.value === null) {
    problems.push("Soft percent must be a whole number between 1 and 100.");
  }
  return problems;
});

const invalid = computed(() => errors.value.length > 0);

function submit() {
  if (invalid.value) return;
  emit("submit", {
    // An empty field means "use the global default" / "no quota"; the server
    // stores null for both.
    baselineRevisionLimit: baseline.value,
    runHistoryDays: runDays.value,
    orphanGraceHours: orphanHours.value,
    storageQuotaBytes: megabytesToByteString(quota.value),
    quotaSoftPercent: soft.value,
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    title="Edit storage retention"
    description="Retention limits are stored per project. Uploads over a hard quota are rejected; the maintenance tasks currently use the global retention defaults."
    confirm-text="Save settings"
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.storageSave"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div class="space-y-4" :data-testid="TEST_ID.storageEditDialog">
      <label class="block space-y-1 text-sm">
        <span>Storage quota (MB)</span>
        <Input
          v-model="quotaMb"
          type="number"
          min="0"
          step="1"
          placeholder="No quota"
          :data-testid="TEST_ID.storageQuotaMb"
        />
        <span class="block text-xs text-muted-foreground">
          Leave empty for no quota; a decimal value is accepted.
        </span>
      </label>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block space-y-1 text-sm">
          <span>Baseline revisions</span>
          <Input
            v-model="baselineLimit"
            type="number"
            min="1"
            step="1"
            placeholder="Global default"
            :data-testid="TEST_ID.storageBaselineLimit"
          />
        </label>

        <label class="block space-y-1 text-sm">
          <span>Run history (days)</span>
          <Input
            v-model="runHistoryDays"
            type="number"
            min="1"
            step="1"
            placeholder="Global default"
            :data-testid="TEST_ID.storageRunDays"
          />
        </label>

        <label class="block space-y-1 text-sm">
          <span>Orphan grace (hours)</span>
          <Input
            v-model="orphanGraceHours"
            type="number"
            min="1"
            step="1"
            placeholder="Global default"
            :data-testid="TEST_ID.storageOrphanHours"
          />
        </label>

        <label class="block space-y-1 text-sm">
          <span>Soft warning percent</span>
          <Input
            v-model="softPercent"
            type="number"
            min="1"
            max="100"
            step="1"
            :aria-invalid="soft === null"
            :data-testid="TEST_ID.storageSoftPercent"
          />
        </label>
      </div>

      <ul v-if="invalid" class="space-y-1" role="alert">
        <li
          v-for="problem in errors"
          :key="problem"
          class="text-sm text-destructive"
        >
          {{ problem }}
        </li>
      </ul>

      <p v-if="error" class="text-sm text-destructive" role="alert">
        {{ sdkErrorMessage(error, "Could not save the storage settings") }}
      </p>
    </div>
  </FormDialog>
</template>
