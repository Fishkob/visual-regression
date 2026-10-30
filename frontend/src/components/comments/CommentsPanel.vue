<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, ChevronDown, ChevronRight } from "@lucide/vue";
import AsyncState from "@/components/AsyncState.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import { Button } from "@/components/ui/button";
import { useReviewComments } from "@/composables/useReviewComments";
import { COMMENT_MAX_LENGTH } from "@/domains/comments/comment.model";
import type { ReviewComment } from "@/domains/comments/comment.model";
import { formatDateTime, formatRelativeAge } from "@/lib/format-date";
import { TEST_ID } from "@/lib/test-ids";

const props = defineProps<{
  projectName: string;
  testName: string;
  branch?: string;
  comparisonId?: string;
  // An inherited test is read-only in this branch: the thread is visible (it
  // belongs to the ancestor's review), but posting and resolving are not.
  readOnly?: boolean;
}>();

// The rail owns the section header and its tab, so this panel is content only.
// It reports the thread size upwards so the tab can carry the count.
const emit = defineEmits<{
  "update:count": [count: number];
}>();

const { t } = useI18n();
const onlyComparison = ref(false);
const body = ref("");
const showResolved = ref(false);

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

watch(list, (thread) => emit("update:count", thread.length), {
  immediate: true,
});

// Open comments lead: a resolved thread is context, not work, so it collapses
// behind one row the reviewer can open. The reported count still covers the
// whole thread, resolved included.
const openComments = computed(() =>
  list.value.filter((comment) => !comment.resolvedAt),
);
const resolvedComments = computed(() =>
  list.value.filter((comment) => !!comment.resolvedAt),
);

// The character budget is only interesting once it becomes a constraint.
const NEAR_LIMIT = COMMENT_MAX_LENGTH - 500;
const trimmed = computed(() => body.value.trim());
const tooLong = computed(() => trimmed.value.length > COMMENT_MAX_LENGTH);
const invalid = computed(() => trimmed.value.length === 0 || tooLong.value);
const nearLimit = computed(() => trimmed.value.length >= NEAR_LIMIT);

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

function resolvedMeta(comment: ReviewComment): string {
  const age = formatRelativeAge(comment.resolvedAt ?? comment.createdAt);
  return comment.resolvedBy
    ? `${t("comments.resolvedBy", { user: comment.resolvedBy })} · ${age}`
    : age;
}
</script>

<template>
  <section
    class="flex h-full min-h-0 flex-col"
    :data-testid="TEST_ID.commentsPanel"
  >
    <div v-if="comparisonId" class="border-b px-4 py-2">
      <label
        class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
      >
        <input
          v-model="onlyComparison"
          type="checkbox"
          class="size-3.5 accent-foreground"
          :data-testid="TEST_ID.commentsOnlyComparison"
        />
        {{ t("comments.onlyComparison") }}
      </label>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4">
      <AsyncState
        :is-loading="isLoading"
        :error="error"
        :error-title="t('comments.errorTitle')"
        :retry="refetch"
        :empty="list.length === 0"
        :empty-title="t('comments.emptyTitle')"
        :empty-description="t('comments.emptyDescription')"
      >
        <template #loading>
          <div class="space-y-3 py-3" role="status" aria-live="polite">
            <div
              v-for="row in 2"
              :key="row"
              class="h-16 animate-pulse rounded-md bg-muted"
            />
            <span class="sr-only">{{ t("common.loading") }}</span>
          </div>
        </template>

        <ul v-if="openComments.length > 0" class="divide-y">
          <li
            v-for="comment in openComments"
            :key="comment.id"
            class="flex gap-3 py-3"
            :data-testid="TEST_ID.commentRow"
          >
            <UserAvatar :name="comment.author" />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-xs font-medium">
                  {{ comment.author }}
                </span>
                <span
                  class="shrink-0 text-xs text-muted-foreground"
                  :title="formatDateTime(comment.createdAt)"
                >
                  {{ formatRelativeAge(comment.createdAt) }}
                </span>
                <Button
                  v-if="!readOnly"
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="ml-auto size-7 text-muted-foreground hover:text-foreground"
                  :aria-label="t('comments.resolve')"
                  :title="t('comments.resolve')"
                  :data-testid="TEST_ID.commentResolve"
                  @click="resolve.mutate(comment.id)"
                >
                  <Check class="size-4" />
                </Button>
              </div>

              <p class="mt-1 text-sm whitespace-pre-wrap break-words">
                {{ comment.body }}
              </p>
            </div>
          </li>
        </ul>

        <div v-if="resolvedComments.length > 0" class="py-2">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded-md py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            :aria-expanded="showResolved"
            :data-testid="TEST_ID.commentsResolvedToggle"
            @click="showResolved = !showResolved"
          >
            <ChevronDown v-if="showResolved" class="size-3.5" />
            <ChevronRight v-else class="size-3.5" />
            {{
              t("comments.resolvedGroup", { count: resolvedComments.length })
            }}
          </button>

          <ul
            v-show="showResolved"
            class="mt-2 divide-y"
            :data-testid="TEST_ID.commentsResolvedGroup"
          >
            <li
              v-for="comment in resolvedComments"
              :key="comment.id"
              class="flex gap-3 py-3"
              :data-testid="TEST_ID.commentRow"
            >
              <UserAvatar :name="comment.author" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="truncate text-xs font-medium">
                    {{ comment.author }}
                  </span>
                  <span
                    class="text-xs text-muted-foreground"
                    :title="formatDateTime(comment.createdAt)"
                  >
                    {{ formatRelativeAge(comment.createdAt) }}
                  </span>
                  <span
                    class="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    :data-testid="TEST_ID.commentResolved"
                  >
                    <Check class="size-2.5" />
                    {{ t("comments.resolvedBadge") }}
                  </span>
                </div>
                <p
                  class="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words"
                >
                  {{ comment.body }}
                </p>
                <p class="mt-1 text-[11px] text-muted-foreground">
                  {{ resolvedMeta(comment) }}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </AsyncState>
    </div>

    <form
      v-if="!readOnly"
      class="space-y-2 border-t px-4 py-3"
      @submit.prevent="submit"
    >
      <textarea
        v-model="body"
        rows="2"
        :maxlength="COMMENT_MAX_LENGTH"
        :placeholder="t('comments.placeholder')"
        class="flex min-h-14 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        :aria-invalid="tooLong"
        :data-testid="TEST_ID.commentsBody"
        @keydown.ctrl.enter.prevent="submit"
        @keydown.meta.enter.prevent="submit"
      />

      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-muted-foreground">
          <span v-if="nearLimit">
            {{ t("comments.counter", { count: trimmed.length }) }}
          </span>
          <kbd
            v-else
            class="rounded border bg-muted px-1 py-0.5 font-sans text-[10px] text-muted-foreground"
          >
            {{ t("comments.submitHint") }}
          </kbd>
        </p>

        <Button
          type="submit"
          size="sm"
          :disabled="invalid || create.isPending.value"
          :data-testid="TEST_ID.commentsSubmit"
        >
          {{
            create.isPending.value ? t("comments.saving") : t("comments.submit")
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
  </section>
</template>
