import { computed, unref, type Ref } from "vue";
import {
  useQuery,
  type QueryKey,
  type UndefinedInitialQueryOptions,
  type UseQueryReturnType,
} from "@tanstack/vue-query";
import { getData } from "@/lib/sdk";
import { DEFAULT_PAGE_SIZE, fetchAllPages } from "@/lib/pagination";

// The paginated-DTO shape every list endpoint returns: an items array plus a
// meta.total the fetch-all loop pages past. Endpoints are free to omit pieces
// (the projects list has an optional data array), so each member is optional.
export interface PaginatedDto<T> {
  data?: T[] | null;
  meta?: { total?: number };
}

export type MaybeRef<T> = T | Ref<T>;

export interface DomainQueryOptions<T> {
  queryKey: MaybeRef<QueryKey>;
  enabled?: MaybeRef<boolean>;
  queryFn: () => Promise<T>;
  placeholderData?: unknown;
  retry?: number | boolean;
}

// Deep module over the TanStack query ceremony: unwraps a reactive queryKey,
// auto-gates the query when the key collapses to [] (the "args not ready yet"
// convention every domain query repeats), and hides the enabled/key plumbing so
// callers only supply the key + the function that fetches and maps the data.
export function useDomainQuery<T>(
  options: DomainQueryOptions<T>,
): UseQueryReturnType<T, Error> {
  const keyRef = computed(() => unref(options.queryKey));
  const enabledRef = computed(
    () => unref(options.enabled ?? true) && keyRef.value.length > 0,
  );

  return useQuery({
    queryKey: keyRef,
    queryFn: options.queryFn,
    enabled: enabledRef,
    retry: options.retry,
    ...(options.placeholderData !== undefined
      ? { placeholderData: options.placeholderData }
      : {}),
  } as UndefinedInitialQueryOptions<T, Error, T, QueryKey>);
}

// The SDK-driven sibling of useDomainQuery. A domain query is always the same
// shape — reactive args, a key built from them (collapsing to [] when the args
// are not ready yet), one SDK call, and a mapper over the unwrapped response —
// so this absorbs the unref/gate/getData/map ceremony a caller would otherwise
// re-type. Callers become a declaration: args + keyOf + sdkFn + map.
export function useSdkQuery<TArgs extends object, TDto, TModel>(options: {
  args: { [K in keyof TArgs]: MaybeRef<TArgs[K]> };
  keyOf: (args: TArgs) => QueryKey;
  sdkFn: (args: TArgs) => Promise<unknown>;
  map: (data: TDto | undefined) => TModel;
  enabled?: MaybeRef<boolean>;
  placeholderData?: unknown;
  retry?: number | boolean;
}): UseQueryReturnType<TModel, Error> {
  const argsRef = computed(() => {
    const unwrapped = {} as TArgs;
    for (const key of Object.keys(options.args) as (keyof TArgs)[]) {
      unwrapped[key] = unref(options.args[key]) as TArgs[keyof TArgs];
    }
    return unwrapped;
  });

  return useDomainQuery<TModel>({
    queryKey: computed(() => options.keyOf(argsRef.value)),
    enabled: options.enabled,
    retry: options.retry,
    placeholderData: options.placeholderData,
    queryFn: async () => {
      const response = await options.sdkFn(argsRef.value);
      return options.map(getData<TDto>(response));
    },
  });
}

// The list sibling of useSdkQuery: absorbs the fetch-all-pages ceremony the
// single-object query seam already absorbed for the detail case. Callers become
// a declaration — key + page fetch (skip/take already unwrapped by the adapter)
// + mapper — instead of re-typing fetchAllPages + getData<PaginatedDto> +
// page.data ?? [] + meta?.total at every list call site.
export function usePaginatedListQuery<TDto, TModel>(options: {
  queryKey: MaybeRef<QueryKey>;
  enabled?: MaybeRef<boolean>;
  retry?: number | boolean;
  placeholderData?: unknown;
  fetchPage: (skip: number, take: number) => Promise<unknown>;
  map: (items: TDto[]) => TModel[];
}): UseQueryReturnType<TModel[], Error> {
  return useDomainQuery<TModel[]>({
    queryKey: options.queryKey,
    enabled: options.enabled,
    retry: options.retry,
    placeholderData: options.placeholderData,
    queryFn: async () => {
      const dtos = await fetchAllPages<TDto>(async (skip) => {
        const response = await options.fetchPage(skip, DEFAULT_PAGE_SIZE);
        const page = getData<PaginatedDto<TDto>>(response);
        return { items: page?.data ?? [], total: page?.meta?.total };
      });
      return options.map(dtos);
    },
  });
}
