<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import FormDialog from "@/components/FormDialog.vue";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sdkErrorMessage } from "@/lib/sdk";
import {
  DEFAULT_SIZE_POLICY,
  SIZE_POLICIES,
  formatTags,
  parseTags,
  type SizePolicy,
  type UpdateTestMetadataInput,
} from "@/domains/test-lifecycle/test-metadata.model";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  name: string;
  description: string | null;
  tags: string[];
  mutedUntil: string | null;
  muteReason: string | null;
  isMuted: boolean;
  sizePolicy: SizePolicy;
  pending?: boolean;
  error?: unknown;
}>();

const { t, d } = useI18n();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submit", payload: UpdateTestMetadataInput): void;
  (e: "unmute"): void;
}>();

const name = ref("");
const description = ref("");
const tags = ref("");
const mutedUntil = ref("");
const muteReason = ref("");
const sizePolicy = ref<SizePolicy>(DEFAULT_SIZE_POLICY);

// ISO in, local datetime-local out; vice versa on submit. The input is local
// time, so the round-trip keeps what the operator typed.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.name;
    description.value = props.description ?? "";
    tags.value = formatTags(props.tags);
    mutedUntil.value = toLocalInput(props.mutedUntil);
    muteReason.value = props.muteReason ?? "";
    sizePolicy.value = props.sizePolicy;
  },
);

const initialMutedUntil = computed(() => toIso(toLocalInput(props.mutedUntil)));
const nextMutedUntil = computed(() => toIso(mutedUntil.value));
const muteReasonMissing = computed(
  () => !!nextMutedUntil.value && !muteReason.value.trim(),
);
const invalid = computed(() => !name.value.trim() || muteReasonMissing.value);

function submit() {
  if (invalid.value) return;
  const parsedTags = parseTags(tags.value);
  const muteChanged = nextMutedUntil.value !== initialMutedUntil.value;
  const reasonChanged =
    muteReason.value.trim() !== (props.muteReason ?? "").trim();
  const includesMute = muteChanged || (reasonChanged && !!nextMutedUntil.value);

  emit("submit", {
    name: name.value.trim(),
    description: description.value.trim() ? description.value.trim() : null,
    tags: parsedTags,
    sizePolicy: sizePolicy.value,
    ...(includesMute
      ? {
          mutedUntil: nextMutedUntil.value,
          muteReason: nextMutedUntil.value ? muteReason.value.trim() : null,
        }
      : {}),
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('lifecycle.edit.title')"
    :description="t('lifecycle.edit.description')"
    :confirm-text="t('lifecycle.edit.confirm')"
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.testMuteSubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <div class="space-y-4" :data-testid="TEST_ID.testEditDialog">
      <label class="block space-y-1 text-sm">
        <span>{{ t("lifecycle.edit.name") }}</span>
        <Input
          v-model="name"
          :aria-invalid="!name.trim()"
          :data-testid="TEST_ID.testEditName"
        />
      </label>

      <label class="block space-y-1 text-sm">
        <span>{{ t("lifecycle.edit.descriptionLabel") }}</span>
        <textarea
          v-model="description"
          rows="3"
          class="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          :data-testid="TEST_ID.testEditDescription"
        />
      </label>

      <label class="block space-y-1 text-sm">
        <span>{{ t("lifecycle.edit.tags") }}</span>
        <Input
          v-model="tags"
          :placeholder="t('lifecycle.edit.tagsPlaceholder')"
          :data-testid="TEST_ID.testEditTags"
        />
        <span class="block text-xs text-muted-foreground">
          {{ t("lifecycle.edit.tagsHelp") }}
        </span>
      </label>

      <label class="block space-y-1 text-sm">
        <span>{{ t("lifecycle.edit.sizePolicy") }}</span>
        <Select v-model="sizePolicy">
          <SelectTrigger :data-testid="TEST_ID.testSizePolicySelect">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="policy in SIZE_POLICIES"
              :key="policy"
              :value="policy"
            >
              {{ t(`sizePolicy.label.${policy}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
        <span class="block text-xs text-muted-foreground">
          {{ t(`sizePolicy.description.${sizePolicy}`) }}
        </span>
      </label>

      <fieldset class="space-y-2 rounded-md border p-3">
        <legend class="px-1 text-sm">
          {{ t("lifecycle.edit.muteLegend") }}
        </legend>
        <p v-if="isMuted" class="text-sm text-muted-foreground">
          {{
            t("lifecycle.edit.mutedUntilText", {
              date: mutedUntil ? d(new Date(mutedUntil)) : "unknown",
            })
          }}
        </p>
        <label class="block space-y-1 text-sm">
          <span>{{ t("lifecycle.edit.mutedUntilLabel") }}</span>
          <input
            v-model="mutedUntil"
            type="datetime-local"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            :data-testid="TEST_ID.testMuteUntil"
          />
        </label>
        <label class="block space-y-1 text-sm">
          <span>{{ t("lifecycle.edit.reason") }}</span>
          <Input
            v-model="muteReason"
            :placeholder="t('lifecycle.edit.reasonPlaceholder')"
            :aria-invalid="muteReasonMissing"
            :data-testid="TEST_ID.testMuteReason"
          />
        </label>
        <p
          v-if="muteReasonMissing"
          class="text-sm text-destructive"
          role="alert"
        >
          {{ t("lifecycle.edit.reasonRequired") }}
        </p>
        <p
          v-if="invalid && !muteReasonMissing"
          class="text-sm text-muted-foreground"
          role="alert"
        >
          {{ t("lifecycle.edit.nameRequired") }}
        </p>
        <div v-if="isMuted" class="flex justify-start">
          <button
            type="button"
            class="text-sm font-medium text-primary underline-offset-4 hover:underline"
            :data-testid="TEST_ID.testUnmute"
            @click="emit('unmute')"
          >
            {{ t("lifecycle.edit.unmuteNow") }}
          </button>
        </div>
      </fieldset>

      <p v-if="error" class="text-sm text-destructive" role="alert">
        {{ sdkErrorMessage(error, t("lifecycle.edit.errorFallback")) }}
      </p>
    </div>
  </FormDialog>
</template>
