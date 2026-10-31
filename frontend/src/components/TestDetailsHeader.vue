<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Breadcrumbs from "@/components/Breadcrumbs.vue";
import { Badge } from "@/components/ui/badge";
import { TEST_ID } from "@/lib/test-ids";
import type { TestKind } from "@/domains/test-kind";

// The top of every reviewable-test page: trail, test name, its kind/branch and
// the inherited-origin facts. The actions opposite the name belong to the kind
// (image: the variants gallery, both: bulk approve), so they arrive through the
// slot. Kept outside the details query on purpose — while the next test in a
// pass is still loading, the frame around the comparison has to stay put.
withDefaults(
  defineProps<{
    testName?: string;
    groupName?: string;
    branch?: string;
    kind?: TestKind | null;
    // The test itself is inherited: it has no reviewable baseline on this
    // branch, so approve/skip belong to the branch that owns it.
    isInherited?: boolean;
    inheritedFrom?: string | null;
    // The test is owned here, but its baseline still tracks another branch
    // until an approval pins it.
    baselineInherited?: boolean;
    inheritTarget?: string | null;
  }>(),
  { kind: null, isInherited: false, baselineInherited: false },
);

defineSlots<{ actions?: () => unknown }>();

const { t } = useI18n();
</script>

<template>
  <header class="space-y-2 px-6 pt-4 pb-2">
    <Breadcrumbs
      class="text-muted-foreground"
      :group-name="groupName"
      :show-test="false"
    />

    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <h1 class="min-w-0 truncate text-xl font-semibold tracking-tight">
          {{ testName }}
        </h1>
        <Badge v-if="kind" variant="outline">
          {{ kind === "pdf" ? t("detail.pdf") : t("detail.image") }}
        </Badge>
        <Badge v-if="branch" variant="outline" class="font-mono text-[10px]">
          {{ branch }}
        </Badge>
        <Badge
          v-if="isInherited"
          variant="secondary"
          class="font-mono text-[10px]"
          :data-testid="TEST_ID.inheritedBadge"
        >
          {{ t("detail.inherited", { branch: inheritedFrom }) }}
        </Badge>
        <!-- The baseline can be inherited even when the test itself is owned:
             it then tracks the target branch until an approval pins it here.
             Without this the reviewer sees a diff against a picture that points
             at another branch with no indication that it does. -->
        <Badge
          v-else-if="baselineInherited"
          variant="outline"
          class="font-mono text-[10px]"
          :title="
            t('detail.baselineFollowsTitle', {
              target:
                inheritTarget ??
                t('detail.baselineFollows', {
                  target: '',
                }),
            })
          "
          :data-testid="TEST_ID.baselineInheritedBadge"
        >
          {{
            t("detail.baselineFollows", {
              target: inheritTarget ?? "target",
            })
          }}
        </Badge>
      </div>

      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
