<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, ChevronRight } from "@lucide/vue";
import AsyncState from "@/components/AsyncState.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useReviewComments } from "@/composables/useReviewComments";
import { COMMENT_MAX_LENGTH } from "@/domains/comments/comment.model";
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  projectName: string;
  testName: string;
  branch?: string;
  comparisonId?: string;
}>();

const { t } = useI18n();
// A thread without comments opens collapsed: the panel sits below the diff, so
// an empty composer must not eat the reviewer's scroll. The first non-empty
// result expands it once; after the reviewer toggles, their choice wins. A
// reload that happens to answer empty does not collapse an open thread, so
// switching threads cannot flicker the section shut.
const expanded = ref(false);
const userToggled = ref(false);
const onlyComparison = ref(false);
const body = ref("");

const {
  data: comments,
  isLoading,
  error,
  refetch,
  create,
  resolve,
} = useReviewComments(
  props.projectName,
  props.testName,
  toRef(props, "branch"),
  toRef(props, "comparisonId"),
  onlyComparison,
);

const list = computed(() => comments.value ?? []);

watch(
  list,
  (thread) => {
    if (!userToggled.value && thread.length > 0) expanded.value = true;
  },
  { immediate: true },
);

function toggle() {
  userToggled.value = true;
  expanded.value = !expanded.value;
}

const trimmed = computed(() => body.value.trim());
const tooLong = computed(() => trimmed.value.length > COMMENT_MAX_LENGTH);
const invalid = computed(() => trimmed.value.length === 0 || tooLong.value);

function submit() {
  if (invalid.value) return;
  create.mutate(
    {
      body: trimmed.value,
      ...(props.comparisonId ? { comparisonId: props.comparisonId } : {}),
      ...(props.branch ? { branch: props.branch } : {}),
    },
    {
      onSuccess: () => {
        body.value = "";
      },
    },
  );
}
</script>

<template>
  <section
    class="rounded-xl border bg-card shadow-sm"
    :data-testid="TEST_ID.commentsPanel"
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
      :aria-expanded="expanded"
      :data-testid="TEST_ID.commentsToggle"
      @click="toggle"
    >
      <ChevronDown v-if="expanded" class="h-4 w-4" />
      <ChevronRight v-else class="h-4 w-4" />
      {{ t("comments.title") }}
      <span class="text-xs font-normal text-muted-foreground">
        {{ t("comments.count", { count: list.length }) }}
      </span>
    </button>

    <div v-if="expanded" class="space-y-3 border-t px-4 py-3">
      <label
        v-if="comparisonId"
        class="flex items-center gap-2 text-xs text-muted-foreground"
      >
        <input
          v-model="onlyComparison"
          type="checkbox"
          class="h-3.5 w-3.5"
          :data-testid="TEST_ID.commentsOnlyComparison"
        />
        {{ t("comments.onlyComparison") }}
      </label>

      <AsyncState
        :is-loading="isLoading"
        :error="error"
        :error-title="t('comments.errorTitle')"
        :retry="refetch"
        :empty="list.length === 0"
        :empty-title="t('comments.emptyTitle')"
        :empty-description="t('comments.emptyDescription')"
      >
        <ul class="max-h-80 space-y-3 overflow-y-auto">
          <li
            v-for="comment in list"
            :key="comment.id"
            class="space-y-1 rounded-md border p-2 text-sm"
            :class="comment.resolvedAt ? 'opacity-60' : ''"
            :data-testid="TEST_ID.commentRow"
          >
            <div
              class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            >
              <span class="font-medium text-foreground">{{
                comment.author
              }}</span>
              <span :title="formatDateTime(comment.createdAt)">
                {{ formatRelativeAge(comment.createdAt) }}
              </span>
              <Badge
                v-if="comment.resolvedAt"
                variant="secondary"
                class="text-[10px]"
                :data-testid="TEST_ID.commentResolved"
              >
                {{ t("comments.resolvedBadge") }}
              </Badge>
              <span v-if="comment.resolvedBy" class="text-[10px]">
                {{ t("comments.resolvedBy", { user: comment.resolvedBy }) }}
              </span>
            </div>
            <p class="whitespace-pre-wrap break-words">{{ comment.body }}</p>
            <Button
              v-if="!comment.resolvedAt"
              type="button"
              variant="outline"
              size="sm"
              :data-testid="TEST_ID.commentResolve"
              @click="resolve.mutate(comment.id)"
            >
              {{ t("comments.resolve") }}
            </Button>
          </li>
        </ul>
      </AsyncState>

      <form class="space-y-2" @submit.prevent="submit">
        <textarea
          v-model="body"
          rows="3"
          :maxlength="COMMENT_MAX_LENGTH"
          :placeholder="t('comments.placeholder')"
          class="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          :aria-invalid="invalid"
          :data-testid="TEST_ID.commentsBody"
        />
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-muted-foreground">
            {{ t("comments.counter", { count: trimmed.length }) }}
          </p>
          <Button
            type="submit"
            size="sm"
            :disabled="invalid || create.isPending.value"
            :data-testid="TEST_ID.commentsSubmit"
          >
            {{
              create.isPending.value
                ? t("comments.saving")
                : t("comments.submit")
            }}
          </Button>
        </div>
        <p v-if="tooLong" class="text-sm text-destructive" role="alert">
          {{ t("comments.tooLong") }}
        </p>
        <p
          v-if="create.error.value"
          class="text-sm text-destructive"
          role="alert"
        >
          {{ t("comments.createError") }}
        </p>
      </form>
    </div>
  </section>
</template>
