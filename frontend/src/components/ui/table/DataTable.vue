<script setup lang="ts" generic="TData extends RowData">
import {
  FlexRender,
  useTable,
  type Column,
  type ColumnDef,
  type RowData,
  type SortingState,
  type Updater,
} from "@tanstack/vue-table";

import { computed, ref } from "vue";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  appTableFeatures,
  type AppTableFeatures,
} from "@/components/ui/table/table-features";
import { TEST_ID } from "@/lib/test-ids";

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<AppTableFeatures, TData>[];
    data: TData[];
    clickableRows?: boolean;
    loading?: boolean;
  }>(),
  {
    clickableRows: true,
    loading: false,
  },
);

const emit = defineEmits<{
  (e: "rowClick", row: TData): void;
}>();

const sorting = ref<SortingState>([]);

const table = useTable<AppTableFeatures, TData>({
  features: appTableFeatures,
  data: computed(() => props.data),
  columns: computed(() => props.columns),

  state: computed(() => ({ sorting: sorting.value })),

  onSortingChange: (updater: Updater<SortingState>) => {
    sorting.value =
      typeof updater === "function" ? updater(sorting.value) : updater;
  },
});

function onSort(
  column: Column<AppTableFeatures, TData, unknown>,
  ev: MouseEvent,
) {
  if (!column.getCanSort?.()) return;
  const handler = column.getToggleSortingHandler?.();
  if (handler) handler(ev);
}

function onRowClick(row: TData) {
  if (!props.clickableRows) return;
  emit("rowClick", row);
}

function onRowKeydown(ev: KeyboardEvent, row: TData) {
  if (ev.target !== ev.currentTarget) return;
  if (ev.key === " " || ev.key === "Spacebar") ev.preventDefault();
  onRowClick(row);
}

type AriaSort = "ascending" | "descending" | "none";

function ariaSort(column: Column<AppTableFeatures, TData, unknown>): AriaSort {
  const direction = column.getIsSorted();
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}

function getColumnId(
  col: ColumnDef<AppTableFeatures, TData>,
  index: number,
): string {
  const c = col as { id?: string; accessorKey?: string };
  return c.id ?? c.accessorKey ?? `col-${index}`;
}

function isActionsColumn(col: ColumnDef<AppTableFeatures, TData>): boolean {
  return (col as { id?: string }).id === "actions";
}
</script>

<template>
  <div class="rounded-xl border bg-card shadow-sm overflow-hidden">
    <Table class="w-full border-collapse">
      <TableHeader
        class="sticky top-0 bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-muted/30 z-20 border-b"
        :data-testid="TEST_ID.tableHeader"
      >
        <TableRow
          v-for="headerGroup in table.getHeaderGroups()"
          :key="headerGroup.id"
          :data-testid="TEST_ID.tableHeaderRow"
        >
          <!-- Left gutter for row hover indicator -->
          <TableHead class="w-1 p-0"></TableHead>

          <TableHead
            v-for="header in headerGroup.headers"
            :key="header.id"
            :data-testid="TEST_ID.tableHeaderCell"
            :aria-sort="
              header.column.getCanSort() ? ariaSort(header.column) : undefined
            "
            class="select-none text-left px-4 py-2 font-medium text-sm text-muted-foreground rounded-sm transition-colors"
            :class="header.column.getCanSort() ? 'hover:bg-muted/50' : ''"
          >
            <button
              v-if="header.column.getCanSort()"
              type="button"
              class="flex w-full cursor-pointer items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @click="onSort(header.column, $event)"
            >
              <FlexRender
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
              <span v-if="header.column.getIsSorted() === 'asc'" class="text-xs"
                >▲</span
              >
              <span
                v-else-if="header.column.getIsSorted() === 'desc'"
                class="text-xs"
                >▼</span
              >
            </button>
            <div v-else class="flex items-center gap-2">
              <FlexRender
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
            </div>
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody :data-testid="TEST_ID.tableBody">
        <template v-if="loading && data.length === 0">
          <TableRow
            v-for="i in 6"
            :key="i"
            :data-testid="TEST_ID.skeletonRow"
            class="group"
          >
            <TableCell class="w-1 p-0 bg-transparent rounded-l-md" />
            <TableCell
              v-for="(col, j) in columns"
              :key="getColumnId(col, j)"
              class="px-4 py-2"
            >
              <div
                class="h-4 bg-muted rounded animate-pulse"
                :class="{
                  'w-8': isActionsColumn(col),
                  'w-3/4': !isActionsColumn(col),
                }"
              />
            </TableCell>
          </TableRow>
        </template>
        <template v-else>
          <TableRow
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :data-testid="TEST_ID.tableRow"
            :tabindex="props.clickableRows ? 0 : undefined"
            :class="[
              'group transition-colors',
              props.clickableRows
                ? 'cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2'
                : '',
            ]"
            @click="onRowClick(row.original)"
            @keydown.enter="onRowKeydown($event, row.original)"
            @keydown.space="onRowKeydown($event, row.original)"
          >
            <TableCell
              class="w-1 p-0 bg-transparent group-hover:bg-primary/60 transition-all duration-150 rounded-l-md"
            ></TableCell>

            <TableCell
              v-for="(cell, index) in row.getVisibleCells()"
              :key="cell.id"
              :data-testid="`cell-${cell.column.id}`"
              :class="[
                'px-4 py-2 text-sm whitespace-nowrap transition-colors',
                'group-hover:bg-muted/30',
                index === 0 ? 'sticky left-1 bg-background z-10 shadow-sm' : '',
              ]"
            >
              <FlexRender
                :render="cell.column.columnDef.cell"
                :props="cell.getContext()"
              />
            </TableCell>
          </TableRow>
        </template>
      </TableBody>
    </Table>
  </div>
</template>
