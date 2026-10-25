<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Share2 } from "@lucide/vue";
import { toast } from "vue-sonner";
import AsyncState from "@/components/AsyncState.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import FormDialog from "@/components/FormDialog.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateShareLink,
  useRevokeShareLink,
  useShareLinks,
} from "@/composables/useShareLinks";
import { mapCreatedShareLink } from "@/domains/share-links/share-link.mapper";
import {
  SHARE_EXPIRY_DEFAULT_DAYS,
  SHARE_EXPIRY_MAX_DAYS,
  SHARE_EXPIRY_MIN_DAYS,
  SHARE_SCOPES,
  isShareLinkActive,
  shareTargetLabel,
  shareUrl,
  type ShareLink,
  type ShareScope,
} from "@/domains/share-links/share-link.model";
import { formatDateTime } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  open: boolean;
  projectName: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const { t } = useI18n();

const {
  data: links,
  isLoading,
  error,
  refetch,
} = useShareLinks(props.projectName);
const createLink = useCreateShareLink(props.projectName);
const revokeLink = useRevokeShareLink(props.projectName);

const scope = ref<ShareScope>("PROJECT");
const testName = ref("");
const branch = ref("");
const runKey = ref("");
const expiresInDays = ref(String(SHARE_EXPIRY_DEFAULT_DAYS));
const passphrase = ref("");
const createdUrl = ref("");
const copied = ref(false);

const revokeTarget = ref<ShareLink | null>(null);
const revokeOpen = ref(false);

const expiryValue = computed(() => Number(expiresInDays.value));
const targetMissing = computed(
  () =>
    (scope.value === "TEST" && !testName.value.trim()) ||
    (scope.value === "RUN" && !runKey.value.trim()),
);
const invalid = computed(
  () =>
    !Number.isInteger(expiryValue.value) ||
    expiryValue.value < SHARE_EXPIRY_MIN_DAYS ||
    expiryValue.value > SHARE_EXPIRY_MAX_DAYS ||
    targetMissing.value,
);

function buildBody() {
  return {
    scope: scope.value,
    ...(scope.value === "TEST" && testName.value.trim()
      ? { testName: testName.value.trim() }
      : {}),
    ...(scope.value !== "PROJECT" && branch.value.trim()
      ? { branch: branch.value.trim() }
      : {}),
    ...(scope.value === "RUN" && runKey.value.trim()
      ? { runKey: runKey.value.trim() }
      : {}),
    expiresInDays: expiryValue.value,
    ...(passphrase.value.trim() ? { passphrase: passphrase.value.trim() } : {}),
  };
}

function submitCreate() {
  if (invalid.value) return;
  createLink.mutate(buildBody(), {
    onSuccess: (dto) => {
      const created = mapCreatedShareLink(dto);
      if (!created) return;
      createdUrl.value = shareUrl(created.token);
      copied.value = false;
      passphrase.value = "";
    },
  });
}

async function copyUrl() {
  if (!createdUrl.value) return;
  try {
    await navigator.clipboard?.writeText(createdUrl.value);
    copied.value = true;
    toast.success(t("share.copied"));
  } catch {
    copied.value = false;
  }
}

function requestRevoke(link: ShareLink) {
  revokeLink.reset();
  revokeTarget.value = link;
  revokeOpen.value = true;
}

function confirmRevoke() {
  const target = revokeTarget.value;
  if (!target) return;
  revokeLink.mutate(target.id, {
    onSuccess: () => {
      revokeOpen.value = false;
      revokeTarget.value = null;
    },
  });
}

function onRevokeOpen(value: boolean) {
  revokeOpen.value = value;
}
</script>

<template>
  <FormDialog
    :open="open"
    :title="t('share.title')"
    :description="t('share.description')"
    :confirm-text="t('share.create')"
    :pending="createLink.isPending.value"
    :submit-disabled="invalid"
    :confirm-test-id="TEST_ID.shareCreateSubmit"
    @update:open="emit('update:open', $event)"
    @submit="submitCreate"
  >
    <div class="space-y-5" :data-testid="TEST_ID.shareDialog">
      <div
        v-if="createdUrl"
        class="space-y-2 rounded-md border bg-muted/30 p-3"
      >
        <p class="text-sm font-medium">{{ t("share.createdTitle") }}</p>
        <code
          class="block overflow-x-auto rounded border bg-background px-2 py-1 font-mono text-xs"
          :data-testid="TEST_ID.shareCreatedUrl"
        >
          {{ createdUrl }}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :aria-label="t('share.copyAria')"
          :data-testid="TEST_ID.shareCopyUrl"
          @click="copyUrl"
        >
          <Share2 class="h-4 w-4" />
          {{ copied ? t("share.copiedButton") : t("share.copy") }}
        </Button>
      </div>

      <fieldset class="space-y-3">
        <legend class="text-sm font-medium">
          {{ t("share.createTitle") }}
        </legend>

        <label class="block space-y-1 text-sm">
          <span>{{ t("share.scope") }}</span>
          <Select v-model="scope">
            <SelectTrigger :data-testid="TEST_ID.shareScope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in SHARE_SCOPES"
                :key="option"
                :value="option"
              >
                {{ t(`share.scopes.${option}`) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label v-if="scope === 'TEST'" class="block space-y-1 text-sm">
          <span>{{ t("share.testNameLabel") }}</span>
          <Input v-model="testName" :data-testid="TEST_ID.shareTestName" />
        </label>

        <label v-if="scope === 'RUN'" class="block space-y-1 text-sm">
          <span>{{ t("share.runKeyLabel") }}</span>
          <Input v-model="runKey" :data-testid="TEST_ID.shareRunKey" />
        </label>

        <label v-if="scope !== 'PROJECT'" class="block space-y-1 text-sm">
          <span>{{ t("share.branchLabel") }}</span>
          <Input v-model="branch" :data-testid="TEST_ID.shareBranch" />
        </label>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block space-y-1 text-sm">
            <span>{{ t("share.expiryLabel") }}</span>
            <Input
              v-model="expiresInDays"
              type="number"
              :min="SHARE_EXPIRY_MIN_DAYS"
              :max="SHARE_EXPIRY_MAX_DAYS"
              :data-testid="TEST_ID.shareExpiry"
            />
          </label>
          <label class="block space-y-1 text-sm">
            <span>{{ t("share.passphraseOptional") }}</span>
            <Input
              v-model="passphrase"
              type="password"
              autocomplete="new-password"
              :data-testid="TEST_ID.shareCreatePassphrase"
            />
          </label>
        </div>

        <p v-if="targetMissing" class="text-sm text-destructive" role="alert">
          {{ t("share.targetRequired") }}
        </p>
        <p
          v-if="
            !Number.isInteger(expiryValue) ||
            expiryValue < SHARE_EXPIRY_MIN_DAYS ||
            expiryValue > SHARE_EXPIRY_MAX_DAYS
          "
          class="text-sm text-destructive"
          role="alert"
        >
          {{
            t("share.expiryInvalid", {
              min: SHARE_EXPIRY_MIN_DAYS,
              max: SHARE_EXPIRY_MAX_DAYS,
            })
          }}
        </p>
      </fieldset>

      <section class="space-y-2">
        <h3 class="text-sm font-medium">{{ t("share.existing") }}</h3>
        <AsyncState
          :is-loading="isLoading"
          :error="error"
          :error-title="t('share.listError')"
          :retry="refetch"
          :empty="(links ?? []).length === 0"
          :empty-title="t('share.emptyTitle')"
          :empty-description="t('share.emptyDescription')"
        >
          <ul class="max-h-64 divide-y overflow-y-auto rounded-md border">
            <li
              v-for="link in links ?? []"
              :key="link.id"
              class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              :data-testid="TEST_ID.shareLinkRow"
            >
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" class="text-[10px]">
                    {{ t(`share.scopes.${link.scope}`) }}
                  </Badge>
                  <span class="truncate font-medium">
                    {{ shareTargetLabel(link) }}
                  </span>
                  <Badge
                    v-if="link.hasPassphrase"
                    variant="outline"
                    class="text-[10px]"
                  >
                    {{ t("share.passphraseBadge") }}
                  </Badge>
                  <Badge
                    v-if="link.revokedAt"
                    variant="destructive"
                    class="text-[10px]"
                  >
                    {{ t("share.revokedBadge") }}
                  </Badge>
                  <Badge
                    v-else-if="!isShareLinkActive(link)"
                    variant="outline"
                    class="text-[10px]"
                  >
                    {{ t("share.expiredBadge") }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{
                    t("share.expiresAt", {
                      date: formatDateTime(link.expiresAt),
                    })
                  }}
                  ·
                  {{ t("share.createdBy", { user: link.createdBy ?? "—" }) }} ·
                  {{ t("share.accessCount", { count: link.accessCount }) }}
                </p>
              </div>
              <Button
                v-if="isShareLinkActive(link)"
                type="button"
                variant="outline"
                size="sm"
                :data-testid="TEST_ID.shareRevoke"
                @click="requestRevoke(link)"
              >
                {{ t("share.revoke") }}
              </Button>
            </li>
          </ul>
        </AsyncState>
      </section>
    </div>
  </FormDialog>

  <ConfirmDialog
    :open="revokeOpen"
    :pending="revokeLink.isPending.value"
    confirm-variant="destructive"
    :title="t('share.revokeTitle')"
    :description="
      t('share.revokeDescription', {
        target: revokeTarget ? shareTargetLabel(revokeTarget) : '',
      })
    "
    :confirm-text="t('share.revoke')"
    :cancel-text="t('common.cancel')"
    @confirm="confirmRevoke"
    @cancel="revokeTarget = null"
    @update:open="onRevokeOpen"
  />
</template>
