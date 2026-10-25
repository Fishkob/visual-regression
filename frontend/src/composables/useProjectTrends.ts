import { computed, unref } from "vue";
import { keepPreviousData } from "@tanstack/vue-query";
import { trendsControllerGet, type TrendsDto } from "@sdk";
import { useSdkQuery, type MaybeRef } from "@/composables/useDomainQuery";
import { mapProjectTrends } from "@/domains/trends/trends.mapper";
import { DEFAULT_TREND_RANGE } from "@/domains/trends/trends.model";
import { trendsQueryKeys } from "@/domains/trends/query-keys";

// The API accepts 1..365; clamping here keeps a stale range in the URL (or a
// hand-typed value) from turning into a 400.
const MIN_TREND_DAYS = 1;
const MAX_TREND_DAYS = 365;

export function clampTrendDays(days: number | undefined): number {
  const requested = Math.round(days ?? DEFAULT_TREND_RANGE);
  if (!Number.isFinite(requested)) return DEFAULT_TREND_RANGE;
  return Math.min(Math.max(requested, MIN_TREND_DAYS), MAX_TREND_DAYS);
}

// One project's trend window. The days are part of the query key, so switching
// 30 → 90 fetches the matching window instead of reusing the other answer; the
// previous window stays on screen while the new one loads.
export function useProjectTrends(
  projectName: MaybeRef<string>,
  days: MaybeRef<number>,
) {
  const windowDays = computed(() => clampTrendDays(unref(days)));

  return useSdkQuery({
    args: { projectName, days: windowDays },
    required: ["projectName"],
    placeholderData: keepPreviousData,
    keyOf: ({ projectName, days }) => trendsQueryKeys.detail(projectName, days),
    sdkFn: ({ projectName, days }) =>
      trendsControllerGet({ path: { projectName }, query: { days } }),
    map: (data: TrendsDto | undefined) => mapProjectTrends(data),
  });
}
