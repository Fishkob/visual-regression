<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, Search, X } from "@lucide/vue";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  API_KEY_NAME_MAX_LENGTH,
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
const projectSearch = ref("");
const projectNamesInput = ref("");
const projectListEl = ref<HTMLElement | null>(null);

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
    .filter((projectName): projectName is string => !!projectName)
    .sort((left, right) => left.localeCompare(right)),
);

const unselectedProjects = computed(() =>
  projectOptions.value.filter(
    (projectName) => !selectedProjects.value.includes(projectName),
  ),
);

// The list only offers what is still missing, so a pick is one click and a
// selection is shown in the chips alone.
const visibleProjects = computed(() => {
  const query = projectSearch.value.trim().toLowerCase();
  if (!query) return unselectedProjects.value;
  return unselectedProjects.value.filter((projectName) =>
    projectName.toLowerCase().includes(query),
  );
});

const allProjectsSelected = computed(
  () =>
    projectOptions.value.length > 0 && unselectedProjects.value.length === 0,
);

function toggleProject(projectName: string) {
  selectedProjects.value = selectedProjects.value.includes(projectName)
    ? selectedProjects.value.filter((selected) => selected !== projectName)
    : [...selectedProjects.value, projectName];
}

function focusFirstProject() {
  projectListEl.value?.querySelector("button")?.focus();
}

// Enter picks the top match instead of submitting the form: a filter field is
// not a submit button, and a key minted by accident is the expensive outcome.
function addFirstMatch() {
  const [first] = visibleProjects.value;
  if (first) toggleProject(first);
}

// Backspace on an empty query drops the last pick — the chip-input convention.
function removeLastOnBackspace() {
  if (projectSearch.value.length > 0) return;
  const last = selectedProjects.value[selectedProjects.value.length - 1];
  if (last) toggleProject(last);
}

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
const trimmedName = computed(() => name.value.trim());
const nameTooLong = computed(
  () => trimmedName.value.length > API_KEY_NAME_MAX_LENGTH,
);
const invalid = computed(
  () =>
    !trimmedName.value ||
    nameTooLong.value ||
    noScopes.value ||
    noProjects.value,
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
    projectSearch.value = "";
    projectNamesInput.value = "";
  },
);

function submit() {
  if (invalid.value) return;
  emit("submit", {
    name: trimmedName.value,
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
        :maxlength="API_KEY_NAME_MAX_LENGTH"
        :aria-invalid="!trimmedName || nameTooLong"
        :data-testid="TEST_ID.createApiKeyName"
      />
      <span class="block text-right text-xs text-muted-foreground">
        {{
          t("apiKeyDialog.nameCounter", {
            count: trimmedName.length,
            max: API_KEY_NAME_MAX_LENGTH,
          })
        }}
      </span>
    </label>

    <p v-if="nameTooLong" class="text-sm text-destructive" role="alert">
      {{ t("apiKeyDialog.nameTooLong", { max: API_KEY_NAME_MAX_LENGTH }) }}
    </p>

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
          class="rounded-md border border-input shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]"
        >
          <div class="flex flex-wrap items-center gap-1 p-1.5">
            <Badge
              v-for="project in selectedProjects"
              :key="project"
              variant="secondary"
              class="max-w-full"
              :data-testid="TEST_ID.apiKeyProjectChip"
              :data-value="project"
            >
              <span class="truncate">{{ project }}</span>
              <button
                type="button"
                class="-mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                :aria-label="t('apiKeyDialog.removeProject', { name: project })"
                :data-testid="TEST_ID.apiKeyProjectChipRemove"
                :data-value="project"
                @click="toggleProject(project)"
              >
                <X class="size-3" />
              </button>
            </Badge>

            <div class="relative min-w-32 flex-1">
              <Search
                class="pointer-events-none absolute left-1 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                v-model="projectSearch"
                type="text"
                autocomplete="off"
                class="h-8 border-0 bg-transparent py-0 pl-6 pr-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
                :placeholder="t('apiKeyDialog.searchProjects')"
                :aria-label="t('apiKeyDialog.searchProjects')"
                :data-testid="TEST_ID.apiKeyProjectSearch"
                @keydown.down.prevent="focusFirstProject"
                @keydown.enter.prevent="addFirstMatch"
                @keydown.backspace="removeLastOnBackspace"
              />
            </div>
          </div>

          <div
            v-if="visibleProjects.length > 0"
            ref="projectListEl"
            class="scrollbar-subtle max-h-44 overflow-y-auto border-t p-1"
          >
            <button
              v-for="project in visibleProjects"
              :key="project"
              type="button"
              class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
              :data-testid="TEST_ID.apiKeyProject"
              :data-value="project"
              @click="toggleProject(project)"
            >
              <Plus class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate">{{ project }}</span>
            </button>
          </div>
          <p
            v-else
            class="border-t px-2 py-1.5 text-xs text-muted-foreground"
            :data-testid="TEST_ID.apiKeyProjectEmpty"
          >
            {{
              allProjectsSelected
                ? t("apiKeyDialog.allProjectsSelected")
                : t("apiKeyDialog.noMatchingProjects")
            }}
          </p>
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
