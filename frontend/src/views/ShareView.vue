<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { statusLabelFor } from "@/components/StatusBadge";
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import { usePublicShare } from "@/composables/usePublicShare";
import { RUN_STATES } from "@/domains/runs/run.model";
import type { PublicShare } from "@/domains/share-links/share-link.model";
import { TEST_ID } from "@/lib/test-ids";

const route = useRoute();
const { t } = useI18n();

const token = computed(() => String(route.params.token ?? ""));
const share = ref<PublicShare | null>(null);
const loading = ref(true);
const submitting = ref(false);
const needsPassphrase = ref(false);
const failure = ref<"notFound" | "generic" | null>(null);
const passphrase = ref("");
const passphraseError = ref(false);

const resolvePublicShare = usePublicShare();

async function resolveShare(): Promise<void> {
  loading.value = true;
  passphraseError.value = false;
  try {
    const resolution = await resolvePublicShare(
      token.value,
      passphrase.value || undefined,
    );
    if (resolution.kind === "resolved") {
      share.value = resolution.share;
      needsPassphrase.value = false;
      failure.value = null;
      return;
    }
    share.value = null;
    if (resolution.kind === "passphrase-required") {
      needsPassphrase.value = true;
      passphraseError.value = passphrase.value.length > 0;
      return;
    }
    needsPassphrase.value = false;
    failure.value = resolution.kind === "not-found" ? "notFound" : "generic";
  } finally {
    loading.value = false;
  }
}

async function submitPassphrase(): Promise<void> {
  if (!passphrase.value.trim() || submitting.value) return;
  submitting.value = true;
  try {
    await resolveShare();
  } finally {
    submitting.value = false;
  }
}

function kindLabel(kind: string | undefined): string {
  return kind === "pdf" ? t("detail.pdf") : t("detail.image");
}

function stateLabel(state: string): string {
  return (RUN_STATES as readonly string[]).includes(state)
    ? t(`runState.${state}`)
    : state;
}

onMounted(() => {
  void resolveShare();
});
</script>

<template>
  <div
    class="mx-auto w-full max-w-4xl space-y-6 p-6"
    :data-testid="TEST_ID.shareView"
  >
    <header v-if="share" class="space-y-1">
      <p
        class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {{ t("share.readOnly") }}
      </p>
      <p class="text-sm text-muted-foreground">
        {{ t("share.expires", { date: formatDateTime(share.expiresAt) }) }}
      </p>
    </header>

    <div v-if="loading" class="py-16 text-center text-sm text-muted-foreground">
      {{ t("common.loading") }}
    </div>

    <template v-else>
      <form
        v-if="needsPassphrase && !share"
        class="mx-auto max-w-sm space-y-3 rounded-xl border bg-card p-6 shadow-sm"
        @submit.prevent="submitPassphrase"
      >
        <h1 class="text-lg font-semibold">{{ t("share.protectedTitle") }}</h1>
        <p class="text-sm text-muted-foreground">
          {{ t("share.protectedBody") }}
        </p>
        <label class="block space-y-1 text-sm">
          <span>{{ t("share.passphraseLabel") }}</span>
          <input
            v-model="passphrase"
            type="password"
            autocomplete="off"
            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            :data-testid="TEST_ID.sharePassphrase"
          />
        </label>
        <p v-if="passphraseError" class="text-sm text-destructive" role="alert">
          {{ t("share.passphraseInvalid") }}
        </p>
        <button
          type="submit"
          class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          :disabled="submitting || !passphrase.trim()"
          :data-testid="TEST_ID.sharePassphraseSubmit"
        >
          {{ t("share.passphraseSubmit") }}
        </button>
      </form>

      <div
        v-if="failure"
        class="space-y-2 rounded-xl border bg-card p-8 text-center shadow-sm"
        :data-testid="TEST_ID.shareError"
      >
        <h1 class="text-lg font-semibold">
          {{
            failure === "notFound"
              ? t("share.notFoundTitle")
              : t("share.errorTitle")
          }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{
            failure === "notFound"
              ? t("share.notFoundBody")
              : t("share.errorBody")
          }}
        </p>
      </div>

      <template v-if="share">
        <section v-if="share.scope === 'PROJECT'" class="space-y-3">
          <h1 class="text-xl font-semibold tracking-tight">
            {{ share.project.name || share.projectName }}
          </h1>
          <p class="text-sm text-muted-foreground">
            {{ t("share.testCount", { count: share.tests?.length ?? 0 }) }}
          </p>
          <div
            class="overflow-hidden rounded-xl border bg-card shadow-sm"
            :data-testid="TEST_ID.shareProjectTests"
          >
            <table class="w-full text-sm">
              <thead class="border-b bg-muted/40 text-left">
                <tr>
                  <th class="px-4 py-2 font-medium">
                    {{ t("share.testName") }}
                  </th>
                  <th class="px-4 py-2 font-medium">{{ t("share.kind") }}</th>
                  <th class="px-4 py-2 font-medium">{{ t("share.branch") }}</th>
                  <th class="px-4 py-2 font-medium">{{ t("share.status") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="test in share.tests ?? []"
                  :key="`${test.name}|${test.branchName ?? ''}`"
                  class="border-b last:border-b-0"
                >
                  <td class="px-4 py-2">{{ test.name }}</td>
                  <td class="px-4 py-2">{{ kindLabel(test.kind) }}</td>
                  <td class="px-4 py-2">{{ test.branchName ?? "—" }}</td>
                  <td class="px-4 py-2">{{ statusLabelFor(test.status) }}</td>
                </tr>
                <tr v-if="(share.tests ?? []).length === 0">
                  <td
                    colspan="4"
                    class="px-4 py-6 text-center text-muted-foreground"
                  >
                    {{ t("share.noTests") }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section
          v-else-if="share.scope === 'TEST' && share.test"
          class="space-y-3 rounded-xl border bg-card p-6 shadow-sm"
          :data-testid="TEST_ID.shareTestSummary"
        >
          <h1 class="text-xl font-semibold tracking-tight">
            {{ share.test.name }}
          </h1>
          <dl class="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted-foreground">{{ t("share.kind") }}</dt>
              <dd>{{ kindLabel(share.test.kind) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t("share.status") }}</dt>
              <dd>{{ statusLabelFor(share.test.status) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t("share.branch") }}</dt>
              <dd>{{ share.test.branchName ?? "—" }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {{ t("share.variantCount") }}
              </dt>
              <dd>{{ share.test.variantCount ?? 0 }}</dd>
            </div>
          </dl>
        </section>

        <section
          v-else-if="share.scope === 'RUN' && share.run"
          class="space-y-4"
          :data-testid="TEST_ID.shareRunSummary"
        >
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-mono text-xl font-semibold tracking-tight">
              {{ share.run.key }}
            </h1>
            <span class="text-sm text-muted-foreground">
              {{ share.run.branchName ?? "—" }} ·
              {{ stateLabel(share.run.state) }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">
                {{ t("runDetail.pendingComparisons") }}
              </p>
              <p class="text-lg font-semibold">
                {{ share.run.counts.pendingComparisons }}
              </p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">
                {{ t("share.mutedPending") }}
              </p>
              <p class="text-lg font-semibold">
                {{ share.run.counts.mutedPending }}
              </p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">
                {{ t("runDetail.pendingJobs") }}
              </p>
              <p class="text-lg font-semibold">
                {{ share.run.counts.pendingJobs }}
              </p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">
                {{ t("runDetail.failedJobs") }}
              </p>
              <p class="text-lg font-semibold">
                {{ share.run.counts.failedJobs }}
              </p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">
                {{ t("runDetail.approved") }}
              </p>
              <p class="text-lg font-semibold">
                {{ share.run.counts.approved }}
              </p>
            </div>
            <div class="rounded-xl border bg-card p-3 shadow-sm">
              <p class="text-xs text-muted-foreground">
                {{ t("runDetail.tests") }}
              </p>
              <p class="text-lg font-semibold">
                {{ share.run.counts.testCount }}
              </p>
            </div>
          </div>
          <p v-if="share.run.finishedAt" class="text-sm text-muted-foreground">
            {{
              t("share.finished", {
                age: formatRelativeAge(share.run.finishedAt),
              })
            }}
          </p>
        </section>
      </template>
    </template>
  </div>
</template>
