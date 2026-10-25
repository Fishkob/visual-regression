<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AsyncState from "@/components/AsyncState.vue";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectTrends } from "@/composables/useProjectTrends";
import { useRouteParams } from "@/composables/useRouteParams";
import {
  DEFAULT_TREND_RANGE,
  TREND_RANGES,
  formatAverage,
  formatRate,
  trendTotals,
  type TrendRange,
} from "@/domains/trends/trends.model";
import { TEST_ID } from "@/lib/test-ids";

const { projectName } = useRouteParams();
const { t } = useI18n();

// The range is a local view preference: the page always opens on 30 days and the
// window is not part of a deep link a reviewer would hand back.
const range = ref<TrendRange>(DEFAULT_TREND_RANGE);

const {
  data: trends,
  isLoading,
  error,
  refetch,
} = useProjectTrends(projectName, range);

const totals = computed(() => trendTotals(trends.value?.daily ?? []));

const RANGE_TEST_ID: Record<TrendRange, string> = {
  30: TEST_ID.trendsRange30,
  90: TEST_ID.trendsRange90,
};
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.trendsView">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-sm text-muted-foreground">{{ projectName }}</p>
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t("trends.title") }}
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          {{ t("trends.subtitle", { range })
          }}<template v-if="trends">
            {{
              t("trends.window", { from: trends.from, to: trends.to })
            }}</template
          >
        </p>
      </div>
      <div
        class="flex items-center gap-2"
        role="group"
        :aria-label="t('trends.rangeLabel')"
      >
        <Button
          v-for="option in TREND_RANGES"
          :key="option"
          type="button"
          size="sm"
          :variant="range === option ? 'default' : 'outline'"
          :aria-pressed="range === option"
          :data-testid="RANGE_TEST_ID[option]"
          @click="range = option"
        >
          {{ t("trends.days", { count: option }) }}
        </Button>
      </div>
    </div>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      :error-title="t('trends.errorTitle')"
      :retry="refetch"
      :empty="!trends"
    >
      <template #loading>
        <div class="space-y-4" aria-hidden="true">
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div
              v-for="i in 4"
              :key="i"
              class="h-28 animate-pulse rounded-xl bg-muted"
            />
          </div>
          <div class="h-48 animate-pulse rounded-xl bg-muted" />
        </div>
      </template>

      <template #empty>
        <div class="rounded-xl border bg-card p-8 text-center shadow-sm">
          <p class="text-sm text-muted-foreground">
            {{ t("trends.empty") }}
          </p>
        </div>
      </template>

      <div v-if="trends" class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <section
            class="rounded-xl border bg-card p-4 shadow-sm"
            :data-testid="TEST_ID.trendsComparisons"
          >
            <p
              class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {{ t("trends.comparisons") }}
            </p>
            <p class="mt-1 text-2xl font-semibold">{{ totals.total }}</p>
            <dl class="mt-2 space-y-1 text-sm">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">{{ t("trends.changed") }}</dt>
                <dd>{{ totals.changed }}</dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">
                  {{ t("trends.unchanged") }}
                </dt>
                <dd>{{ totals.unchanged }}</dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">
                  {{ t("trends.withinThreshold") }}
                </dt>
                <dd>{{ totals.withinThreshold }}</dd>
              </div>
            </dl>
          </section>

          <section
            class="rounded-xl border bg-card p-4 shadow-sm"
            :data-testid="TEST_ID.trendsPendingReview"
          >
            <p
              class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {{ t("trends.pendingReview") }}
            </p>
            <p class="mt-1 text-2xl font-semibold">
              {{ trends.pendingReview.count }}
            </p>
            <dl class="mt-2 space-y-1 text-sm">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">
                  {{ t("trends.averageAge") }}
                </dt>
                <dd>
                  {{
                    formatAverage(
                      trends.pendingReview.count,
                      trends.pendingReview.avgSeconds,
                    )
                  }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">{{ t("trends.oldest") }}</dt>
                <dd>
                  {{
                    formatAverage(
                      trends.pendingReview.count,
                      trends.pendingReview.maxSeconds,
                    )
                  }}
                </dd>
              </div>
            </dl>
          </section>

          <section
            class="rounded-xl border bg-card p-4 shadow-sm"
            :data-testid="TEST_ID.trendsApprovalLatency"
          >
            <p
              class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {{ t("trends.approvalLatency") }}
            </p>
            <p class="mt-1 text-2xl font-semibold">
              {{ trends.approvalLatency.count }}
            </p>
            <dl class="mt-2 space-y-1 text-sm">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">
                  {{ t("trends.averageToApprove") }}
                </dt>
                <dd>
                  {{
                    formatAverage(
                      trends.approvalLatency.count,
                      trends.approvalLatency.avgSeconds,
                    )
                  }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">
                  {{ t("trends.approved") }}
                </dt>
                <dd>{{ trends.approvalLatency.count }}</dd>
              </div>
            </dl>
          </section>

          <section
            class="rounded-xl border bg-card p-4 shadow-sm"
            :data-testid="TEST_ID.trendsFlakeRate"
          >
            <p
              class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {{ t("trends.flakeRate") }}
            </p>
            <p class="mt-1 text-2xl font-semibold">
              {{ formatRate(trends.flakeRate.rate) }}
            </p>
            <dl class="mt-2 space-y-1 text-sm">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">
                  {{ t("trends.flakyTests") }}
                </dt>
                <dd>{{ trends.flakeRate.flakyTests }}</dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted-foreground">
                  {{ t("trends.testsWithOutcomes") }}
                </dt>
                <dd>{{ trends.flakeRate.totalTests }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section class="space-y-2">
          <h2 class="text-sm font-semibold text-muted-foreground">
            {{ t("trends.daily") }}
          </h2>

          <div
            v-if="trends.daily.length === 0"
            class="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm"
            :data-testid="TEST_ID.trendsEmpty"
          >
            {{ t("trends.noOutcomes") }}
          </div>

          <div
            v-else
            class="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{{ t("trends.date") }}</TableHead>
                  <TableHead>{{ t("trends.changed") }}</TableHead>
                  <TableHead>{{ t("trends.unchanged") }}</TableHead>
                  <TableHead>{{ t("trends.withinThreshold") }}</TableHead>
                  <TableHead>{{ t("trends.total") }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="day in trends.daily"
                  :key="day.date"
                  :data-testid="TEST_ID.trendsDailyRow"
                >
                  <TableCell class="whitespace-nowrap font-mono text-xs">
                    {{ day.date }}
                  </TableCell>
                  <TableCell>{{ day.changed }}</TableCell>
                  <TableCell>{{ day.unchanged }}</TableCell>
                  <TableCell>{{ day.withinThreshold }}</TableCell>
                  <TableCell class="font-medium">{{ day.total }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </AsyncState>
  </div>
</template>
