<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
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
import { useAllProjectsQuery } from "@/composables/useProjects";
import {
  API_KEY_SCOPES,
  DEFAULT_API_KEY_SCOPES,
  type ApiKeyScope,
} from "@/domains/api-keys/api-key.model";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
  error?: unknown;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (
    e: "submit",
    payload: {
      name: string;
      expiresInDays?: number;
      scopes: ApiKeyScope[];
      projectNames: string[];
    },
  ): void;
}>();

const { t } = useI18n();
const EXPIRY_OPTIONS = [
  { value: "never", labelKey: "apiKeyDialog.never" },
  { value: "30", labelKey: "apiKeyDialog.days30" },
  { value: "90", labelKey: "apiKeyDialog.days90" },
  { value: "365", labelKey: "apiKeyDialog.year" },
];

const name = ref("");
const expiry = ref("never");
// Upload-only is the default; every extra scope is an explicit grant.
const scopes = ref<ApiKeyScope[]>([...DEFAULT_API_KEY_SCOPES]);
const allProjects = ref(true);
const selectedProjects = ref<string[]>([]);
const projectNamesInput = ref("");

// The allowlist needs every project name, not one page, so it reads the
// unpaginated list. When that list is empty (nothing created yet, or the read
// failed) the field falls back to a comma-separated input.
// Only fetched once the dialog opens: the allowlist picker is the only consumer,
// and a closed dialog must not spend a request per page view.
const { data: projectsData, isLoading: projectsLoading } = useAllProjectsQuery(
  toRef(props, "open"),
);

const projectOptions = computed(() =>
  (projectsData.value ?? [])
    .map((project) => project.name)
    .filter((projectName): projectName is string => !!projectName),
);

function parseProjectNames(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((projectName) => projectName.trim())
        .filter((projectName) => projectName.length > 0),
    ),
  ];
}

const needsProjectInput = computed(
  () => !projectsLoading.value && projectOptions.value.length === 0,
);

const restrictedProjectNames = computed(() =>
  needsProjectInput.value
    ? parseProjectNames(projectNamesInput.value)
    : selectedProjects.value,
);

const noScopes = computed(() => scopes.value.length === 0);
const noProjects = computed(
  () => !allProjects.value && restrictedProjectNames.value.length === 0,
);
const invalid = computed(
  () => !name.value.trim() || noScopes.value || noProjects.value,
);
const showAdminWarning = computed(() => scopes.value.includes("admin"));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = "";
    expiry.value = "never";
    scopes.value = [...DEFAULT_API_KEY_SCOPES];
    allProjects.value = true;
    selectedProjects.value = [];
    projectNamesInput.value = "";
  },
);

function submit() {
  if (invalid.value) return;
  emit("submit", {
    name: name.value.trim(),
    ...(expiry.value === "never"
      ? {}
      : { expiresInDays: Number(expiry.value) }),
    scopes: [...scopes.value],
    projectNames: allProjects.value ? [] : restrictedProjectNames.value,
  });
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('apiKeyDialog.title')"
    :description="t('apiKeyDialog.description')"
    :confirm-text="t('apiKeyDialog.create')"
    :pending="pending"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.createApiKeySubmit"
    @update:open="emit('update:open', $event)"
    @submit="submit"
  >
    <label class="block space-y-1 text-sm">
      <span>{{ t("apiKeyDialog.name") }}</span>
      <Input
        v-model="name"
        placeholder="ci-upload"
        :aria-invalid="!name.trim()"
        :data-testid="TEST_ID.createApiKeyName"
      />
    </label>

    <label class="block space-y-1 text-sm">
      <span>{{ t("apiKeyDialog.expires") }}</span>
      <Select v-model="expiry">
        <SelectTrigger :data-testid="TEST_ID.createApiKeyExpiry">
          <SelectValue :placeholder="t('apiKeyDialog.never')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in EXPIRY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ t(option.labelKey) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </label>

    <fieldset class="space-y-2">
      <legend class="text-sm">{{ t("apiKeyDialog.scopes") }}</legend>
      <label
        v-for="scope in API_KEY_SCOPES"
        :key="scope"
        class="flex items-start gap-2 text-sm"
      >
        <input
          v-model="scopes"
          type="checkbox"
          :value="scope"
          class="mt-0.5"
          :data-testid="TEST_ID.apiKeyScope"
        />
        <span>
          <span class="font-mono font-medium">{{ scope }}</span>
          <span class="block text-xs text-muted-foreground">
            {{ t(`apiKeyDialog.scope.${scope}`) }}
          </span>
        </span>
      </label>
      <p v-if="noScopes" class="text-sm text-destructive" role="alert">
        {{ t("apiKeyDialog.noScopes") }}
      </p>
      <p
        v-if="showAdminWarning"
        class="text-sm text-destructive"
        role="alert"
        :data-testid="TEST_ID.apiKeyAdminWarning"
      >
        {{ t("apiKeyDialog.adminWarning") }}
      </p>
    </fieldset>

    <fieldset class="space-y-2">
      <legend class="text-sm">{{ t("apiKeyDialog.projects") }}</legend>
      <label class="flex items-center gap-2 text-sm">
        <input
          v-model="allProjects"
          type="checkbox"
          :data-testid="TEST_ID.apiKeyAllProjects"
        />
        <span>{{ t("apiKeyDialog.allProjects") }}</span>
      </label>

      <template v-if="!allProjects">
        <p v-if="projectsLoading" class="text-xs text-muted-foreground">
          {{ t("apiKeyDialog.loadingProjects") }}
        </p>
        <div
          v-else-if="projectOptions.length > 0"
          class="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2"
        >
          <label
            v-for="project in projectOptions"
            :key="project"
            class="flex items-center gap-2 text-sm"
          >
            <input
              v-model="selectedProjects"
              type="checkbox"
              :value="project"
              :data-testid="TEST_ID.apiKeyProject"
            />
            <span class="truncate">{{ project }}</span>
          </label>
        </div>
        <div v-else class="space-y-1">
          <p class="text-xs text-muted-foreground">
            {{ t("apiKeyDialog.noProjectList") }}
          </p>
          <Input
            v-model="projectNamesInput"
            placeholder="checkout-ui, admin-ui"
            :data-testid="TEST_ID.apiKeyProjectNames"
          />
        </div>
        <p v-if="noProjects" class="text-sm text-destructive" role="alert">
          {{ t("apiKeyDialog.noProjects") }}
        </p>
      </template>
    </fieldset>

    <p v-if="error" class="text-sm text-destructive" role="alert">
      {{ sdkErrorMessage(error, t("apiKeyDialog.createError")) }}
    </p>
  </FormDialog>
</template>
