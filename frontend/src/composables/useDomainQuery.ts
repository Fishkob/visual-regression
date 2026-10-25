import { computed, unref, type Ref } from "vue";
import {
  useQuery,
  type QueryKey,
  type UndefinedInitialQueryOptions,
  type UseQueryReturnType,
} from "@tanstack/vue-query";
import { unwrapSdkData, getData } from "@/lib/sdk";
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
  staleTime?: number;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  refetchOnWindowFocus?: boolean | "always";
}

// The freshness knobs a live view needs. Kept as one shape so every wrapper
// forwards the same set instead of each one re-declaring a partial copy.
export interface LiveQueryOptions {
  staleTime?: number;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  refetchOnWindowFocus?: boolean | "always";
}

function liveOptions(options: LiveQueryOptions) {
  return {
    ...(options.staleTime !== undefined
      ? { staleTime: options.staleTime }
      : {}),
    ...(options.refetchInterval !== undefined
      ? { refetchInterval: options.refetchInterval }
      : {}),
    ...(options.refetchIntervalInBackground !== undefined
      ? { refetchIntervalInBackground: options.refetchIntervalInBackground }
      : {}),
    ...(options.refetchOnWindowFocus !== undefined
      ? { refetchOnWindowFocus: options.refetchOnWindowFocus }
      : {}),
  };
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
    ...(options.retry !== undefined ? { retry: options.retry } : {}),
    ...(options.placeholderData !== undefined
      ? { placeholderData: options.placeholderData }
      : {}),
    ...liveOptions(options),
  } as UndefinedInitialQueryOptions<T, Error, T, QueryKey>);
}

// The args a required-key list narrows to: each declared required key is no
// longer possibly-undefined, so keyOf/sdkFn never see the "not ready" state.
export type ReadyArgs<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? NonNullable<T[P]> : T[P];
};

// The SDK-driven sibling of useDomainQuery. A domain query is always the same
// shape — reactive args, one SDK call, a mapper over the unwrapped response —
// so this absorbs the unref/gate/getData/map ceremony a caller would otherwise
// re-type. The `required` list names the args that must be truthy before the
// query may run: until then the key collapses to [] (the disabled convention
// useDomainQuery owns) and keyOf/sdkFn receive narrowed args, so callers stop
// re-encoding `x && y ? key : []` gates and `x!` assertions. The payload type
// TDto is inferred from the mapper's parameter, so an SDK function whose DTO
// the OpenAPI spec leaves `unknown` still maps precisely.
// A one-shot SDK read for previews that must NOT populate the query cache
// (e.g. the threshold auto-accept preview, asked on every blur). Unwraps via
// getData exactly like the query seam, and returns null when the call fails or
// the payload has no data member — a failed preview reads "cannot answer"
// rather than crashing the caller. Fire-on-demand: no key, no caching, no gating.
export async function previewSdkRead<T>(
  sdkFn: () => Promise<unknown>,
): Promise<T | null> {
  try {
    return getData<T>(await sdkFn()) ?? null;
  } catch {
    return null;
  }
}

export function useSdkQuery<
  TArgs extends object,
  TDto,
  TModel,
  K extends keyof TArgs,
>(
  options: {
    args: { [P in keyof TArgs]: MaybeRef<TArgs[P]> };
    required: readonly K[];
    keyOf: (args: ReadyArgs<TArgs, K>) => QueryKey;
    sdkFn: (args: ReadyArgs<TArgs, K>) => Promise<unknown>;
    map: (data: TDto | undefined) => TModel;
    enabled?: MaybeRef<boolean>;
    placeholderData?: unknown;
    retry?: number | boolean;
  } & LiveQueryOptions,
): UseQueryReturnType<TModel, Error> {
  const argsRef = computed(() => {
    const unwrapped = {} as TArgs;
    for (const key of Object.keys(options.args) as (keyof TArgs)[]) {
      unwrapped[key] = unref(options.args[key]) as TArgs[keyof TArgs];
    }
    return unwrapped;
  });

  const readyRef = computed(() =>
    options.required.every((key) => Boolean(argsRef.value[key])),
  );
  const readyArgs = computed(() => argsRef.value as ReadyArgs<TArgs, K>);

  return useDomainQuery<TModel>({
    queryKey: computed(() =>
      readyRef.value ? options.keyOf(readyArgs.value) : [],
    ),
    enabled: options.enabled,
    ...(options.retry !== undefined ? { retry: options.retry } : {}),
    placeholderData: options.placeholderData,
    ...liveOptions(options),
    queryFn: async () => {
      const response = await options.sdkFn(readyArgs.value);
      return options.map(unwrapSdkData<TDto>(response));
    },
  });
}

// The single-page list sibling: the server does the paging, the caller renders
// one page and a pager. Unlike usePaginatedListQuery this never loops, so a
// large project list costs one request instead of one per hundred rows.
export interface PagedList<TModel> {
  items: TModel[];
  total: number;
  page: number;
  pageSize: number;
}

export function usePagedListQuery<TDto, TModel>(
  options: {
    queryKey: MaybeRef<QueryKey>;
    page: MaybeRef<number>;
    pageSize: number;
    enabled?: MaybeRef<boolean>;
    retry?: number | boolean;
    placeholderData?: unknown;
    fetchPage: (skip: number, take: number) => Promise<unknown>;
    map: (items: TDto[]) => TModel[];
  } & LiveQueryOptions,
): UseQueryReturnType<PagedList<TModel>, Error> {
  const pageRef = computed(() => Math.max(1, unref(options.page) || 1));
  return useDomainQuery<PagedList<TModel>>({
    queryKey: options.queryKey,
    enabled: options.enabled,
    ...(options.retry !== undefined ? { retry: options.retry } : {}),
    placeholderData: options.placeholderData,
    ...liveOptions(options),
    queryFn: async () => {
      const page = pageRef.value;
      const response = await options.fetchPage(
        (page - 1) * options.pageSize,
        options.pageSize,
      );
      const payload = unwrapSdkData<PaginatedDto<TDto>>(response);
      return {
        items: options.map(payload?.data ?? []),
        total: payload?.meta?.total ?? 0,
        page,
        pageSize: options.pageSize,
      };
    },
  });
}

// The list sibling of useSdkQuery: absorbs the fetch-all-pages ceremony the
// single-object query seam already absorbed for the detail case. Callers become
// a declaration — key + page fetch (skip/take already unwrapped by the adapter)
// + mapper — instead of re-typing fetchAllPages + getData<PaginatedDto> +
// page.data ?? [] + meta?.total at every list call site.
export function usePaginatedListQuery<TDto, TModel>(
  options: {
    queryKey: MaybeRef<QueryKey>;
    enabled?: MaybeRef<boolean>;
    retry?: number | boolean;
    placeholderData?: unknown;
    fetchPage: (skip: number, take: number) => Promise<unknown>;
    map: (items: TDto[]) => TModel[];
  } & LiveQueryOptions,
): UseQueryReturnType<TModel[], Error> {
  return useDomainQuery<TModel[]>({
    queryKey: options.queryKey,
    enabled: options.enabled,
    ...(options.retry !== undefined ? { retry: options.retry } : {}),
    placeholderData: options.placeholderData,
    ...liveOptions(options),
    queryFn: async () => {
      const dtos = await fetchAllPages<TDto>(async (skip) => {
        const response = await options.fetchPage(skip, DEFAULT_PAGE_SIZE);
        const page = unwrapSdkData<PaginatedDto<TDto>>(response);
        return { items: page?.data ?? [], total: page?.meta?.total };
      });
      return options.map(dtos);
    },
  });
}
