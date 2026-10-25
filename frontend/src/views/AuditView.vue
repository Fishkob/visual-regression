<script setup lang="ts">
import { computed, ref } from "vue";
import { Download } from "@lucide/vue";
import { auditControllerExport } from "@sdk";
import { toast } from "vue-sonner";
import AsyncState from "@/components/AsyncState.vue";
import PaginationBar from "@/components/PaginationBar.vue";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditEvents } from "@/composables/useAuditEvents";
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditEvent,
  type AuditFilters,
} from "@/domains/audit/audit-event.model";
import {
  auditActionLabel,
  auditMetadataJson,
  describeAuditMetadata,
} from "@/domains/audit/audit-event.mapper";
import { FILTER_ALL } from "@/domains/test-status";
import { triggerDownload } from "@/lib/download";
import { formatRelativeAge } from "@/lib/format-date";
import { unwrapSdkData } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

// Draft inputs stay local so typing does not fire a request per keystroke; the
// applied filters are what the query (and the export) reads. Applying always
// returns to page 1 because the previous page may not exist for the new set.
const actorInput = ref("");
const actionInput = ref<string>(FILTER_ALL);
const projectInput = ref("");
const fromInput = ref("");
const toInput = ref("");

const appliedFilters = ref<AuditFilters>({});
const page = ref(1);

const { data, isLoading, error, refetch } = useAuditEvents(
  appliedFilters,
  page,
);

const events = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
const pageCount = computed(() => Math.max(1, data.value?.totalPages ?? 0));
// The pager follows the page the server reports, not just the requested one.
const currentPage = computed(() => data.value?.page ?? page.value);

// The date inputs describe whole local days; the API compares timestamps, so
// `from` starts at 00:00 and `to` ends at 23:59:59.999 of the chosen day.
function dayBoundary(value: string, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function draftFilters(): AuditFilters {
  const actor = actorInput.value.trim();
  const projectName = projectInput.value.trim();
  const from = dayBoundary(fromInput.value, false);
  const to = dayBoundary(toInput.value, true);

  return {
    ...(actor ? { actor } : {}),
    ...(actionInput.value !== FILTER_ALL
      ? { action: actionInput.value as AuditAction }
      : {}),
    ...(projectName ? { projectName } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

function applyFilters() {
  appliedFilters.value = draftFilters();
  page.value = 1;
}

function resetFilters() {
  actorInput.value = "";
  actionInput.value = FILTER_ALL;
  projectInput.value = "";
  fromInput.value = "";
  toInput.value = "";
  appliedFilters.value = {};
  page.value = 1;
}

function absoluteTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function targetLabel(event: AuditEvent): string {
  return [event.targetType, event.targetId].filter(Boolean).join(" ");
}

function detailsSummary(event: AuditEvent): string {
  return describeAuditMetadata(event.metadata) || "—";
}

// Undefined removes the title attribute when there is no payload to show.
function detailsTitle(event: AuditEvent): string | undefined {
  return auditMetadataJson(event.metadata) || undefined;
}

const exporting = ref(false);

// The export is a snapshot of the applied filters, not of the draft inputs:
// what the operator sees in the table is what the CSV contains.
async function exportCsv() {
  exporting.value = true;
  try {
    const response = await auditControllerExport({
      query: {
        ...(appliedFilters.value.actor
          ? { actor: appliedFilters.value.actor }
          : {}),
        ...(appliedFilters.value.action
          ? { action: appliedFilters.value.action }
          : {}),
        ...(appliedFilters.value.projectName
          ? { projectName: appliedFilters.value.projectName }
          : {}),
        ...(appliedFilters.value.from
          ? { from: appliedFilters.value.from }
          : {}),
        ...(appliedFilters.value.to ? { to: appliedFilters.value.to } : {}),
      },
      parseAs: "text",
    });
    const csv = unwrapSdkData<string>(response);
    if (typeof csv !== "string") {
      throw new Error("The audit export came back empty");
    }
    triggerDownload(new Blob([csv], { type: "text/csv" }), "audit.csv");
    toast.success("Audit log exported");
  } catch {
    toast.error("Could not export the audit log");
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6" :data-testid="TEST_ID.auditView">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Audit log</h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Who changed what — approvals, restores, deletions and settings.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        :disabled="exporting"
        :data-testid="TEST_ID.auditExport"
        @click="exportCsv"
      >
        <Download class="h-4 w-4" />
        {{ exporting ? "Exporting…" : "Export CSV" }}
      </Button>
    </div>

    <form
      class="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-sm"
      @submit.prevent="applyFilters"
    >
      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">Actor</span>
        <Input
          v-model="actorInput"
          placeholder="Any actor"
          aria-label="Filter by actor"
          class="w-40"
          :data-testid="TEST_ID.auditActorFilter"
        />
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">Action</span>
        <Select v-model="actionInput">
          <SelectTrigger
            class="w-48"
            aria-label="Filter by action"
            :data-testid="TEST_ID.auditActionFilter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="FILTER_ALL">All actions</SelectItem>
            <SelectItem
              v-for="action in AUDIT_ACTIONS"
              :key="action"
              :value="action"
            >
              {{ auditActionLabel(action) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">Project</span>
        <Input
          v-model="projectInput"
          placeholder="Any project"
          aria-label="Filter by project"
          class="w-40"
          :data-testid="TEST_ID.auditProjectFilter"
        />
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">From</span>
        <Input
          v-model="fromInput"
          type="date"
          aria-label="Filter from date"
          class="w-40"
          :data-testid="TEST_ID.auditFromFilter"
        />
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">To</span>
        <Input
          v-model="toInput"
          type="date"
          aria-label="Filter to date"
          class="w-40"
          :data-testid="TEST_ID.auditToFilter"
        />
      </div>

      <div class="flex items-center gap-2">
        <Button
          type="button"
          :data-testid="TEST_ID.auditApply"
          @click="applyFilters"
        >
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          :data-testid="TEST_ID.auditReset"
          @click="resetFilters"
        >
          Reset
        </Button>
      </div>
    </form>

    <AsyncState
      :is-loading="isLoading"
      :error="error"
      error-title="Failed to load the audit log"
      :retry="refetch"
      :empty="events.length === 0"
    >
      <template #loading>
        <div
          class="overflow-hidden rounded-xl border bg-card shadow-sm"
          aria-hidden="true"
        >
          <div
            v-for="row in 5"
            :key="row"
            class="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
            :data-testid="TEST_ID.skeletonRow"
          >
            <div class="h-4 w-24 animate-pulse rounded bg-muted" />
            <div class="h-4 w-32 animate-pulse rounded bg-muted" />
            <div class="h-5 w-28 animate-pulse rounded bg-muted" />
            <div class="h-4 flex-1 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </template>

      <template #empty>
        <div
          class="rounded-xl border bg-card p-8 text-center shadow-sm"
          :data-testid="TEST_ID.auditEmpty"
        >
          <p class="text-sm text-muted-foreground">
            No audit events match these filters.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <div class="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Project/Test</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="event in events"
                :key="event.id"
                :data-testid="TEST_ID.auditRow"
              >
                <TableCell class="whitespace-nowrap">
                  <span :title="absoluteTime(event.createdAt)">
                    {{ formatRelativeAge(event.createdAt) }}
                  </span>
                </TableCell>
                <TableCell class="whitespace-nowrap">
                  {{ event.actor ?? "—" }}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {{ auditActionLabel(event.action) }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p class="truncate">
                    {{ event.projectName ?? "—" }}
                  </p>
                  <p
                    v-if="event.testName"
                    class="truncate text-xs text-muted-foreground"
                  >
                    {{ event.testName }}
                  </p>
                  <p
                    v-if="event.branchName"
                    class="truncate text-xs text-muted-foreground"
                  >
                    {{ event.branchName }}
                  </p>
                </TableCell>
                <TableCell>
                  <span
                    class="block max-w-40 truncate font-mono text-xs"
                    :title="targetLabel(event)"
                  >
                    {{ targetLabel(event) || "—" }}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    class="block max-w-64 truncate text-xs text-muted-foreground"
                    :title="detailsTitle(event)"
                    :data-testid="TEST_ID.auditDetails"
                  >
                    {{ detailsSummary(event) }}
                  </span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <PaginationBar
          v-if="pageCount > 1"
          :page="currentPage"
          :page-count="pageCount"
          :total="total"
          item-label="events"
          @update:page="page = $event"
        />
      </div>
    </AsyncState>
  </div>
</template>
