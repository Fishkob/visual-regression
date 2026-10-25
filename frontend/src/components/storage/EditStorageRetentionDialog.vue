<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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

const { t } = useI18n();

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
    problems.push(t("storageEdit.quotaError"));
  }
  if (asText(baselineLimit.value).trim() && baseline.value === null) {
    problems.push(t("storageEdit.baselineError"));
  }
  if (asText(runHistoryDays.value).trim() && runDays.value === null) {
    problems.push(t("storageEdit.runError"));
  }
  if (asText(orphanGraceHours.value).trim() && orphanHours.value === null) {
    problems.push(t("storageEdit.orphanError"));
  }
  if (soft.value === null) {
    problems.push(t("storageEdit.softError"));
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
    :title="t('storageEdit.title')"
    :description="t('storageEdit.description')"
    :confirm-text="t('storageEdit.confirm')"
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.storageSave"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div class="space-y-4" :data-testid="TEST_ID.storageEditDialog">
      <label class="block space-y-1 text-sm">
        <span>{{ t("storageEdit.quotaLabel") }}</span>
        <Input
          v-model="quotaMb"
          type="number"
          min="0"
          step="1"
          :placeholder="t('storageEdit.noQuotaPlaceholder')"
          :data-testid="TEST_ID.storageQuotaMb"
        />
        <span class="block text-xs text-muted-foreground">
          {{ t("storageEdit.quotaHelp") }}
        </span>
      </label>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block space-y-1 text-sm">
          <span>{{ t("storageEdit.baseline") }}</span>
          <Input
            v-model="baselineLimit"
            type="number"
            min="1"
            step="1"
            :placeholder="t('storageEdit.globalDefaultPlaceholder')"
            :data-testid="TEST_ID.storageBaselineLimit"
          />
        </label>

        <label class="block space-y-1 text-sm">
          <span>{{ t("storageEdit.runDays") }}</span>
          <Input
            v-model="runHistoryDays"
            type="number"
            min="1"
            step="1"
            :placeholder="t('storageEdit.globalDefaultPlaceholder')"
            :data-testid="TEST_ID.storageRunDays"
          />
        </label>

        <label class="block space-y-1 text-sm">
          <span>{{ t("storageEdit.orphan") }}</span>
          <Input
            v-model="orphanGraceHours"
            type="number"
            min="1"
            step="1"
            :placeholder="t('storageEdit.globalDefaultPlaceholder')"
            :data-testid="TEST_ID.storageOrphanHours"
          />
        </label>

        <label class="block space-y-1 text-sm">
          <span>{{ t("storageEdit.soft") }}</span>
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
        {{ sdkErrorMessage(error, t("storageEdit.errorFallback")) }}
      </p>
    </div>
  </FormDialog>
</template>
