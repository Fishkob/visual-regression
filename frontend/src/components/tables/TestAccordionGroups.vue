<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { ColumnDef } from "@tanstack/vue-table";
import type { AppTableFeatures } from "@/components/ui/table/table-features";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import DataTable from "@/components/ui/table/DataTable.vue";
import { getStatusCountBadge } from "@/components/StatusBadge";
import { isInheritedOrigin } from "@/domains/branches/branch-origin";
import type { VisualTestItem } from "@/domains/projects/project.model";
import type { TestGroup } from "@/domains/projects/test-group";
import { TEST_ID } from "@/lib/test-ids";

// The defaults are uncontrolled — they only apply on mount — so the template
// keys the accordion on the group set: a group introduced by a filter then
// mounts expanded instead of inheriting the previous set's open items. The price
// is that a filter change re-expands everything, which is the intended default.
//
// Bulk deletion selects whole tests, not variant rows: the endpoint takes test
// names, and the accordion group IS the test. A group whose rows are all
// inherited exists only on an ancestor branch, so it has nothing to delete here
// and gets no checkbox.
const props = defineProps<{
  groups: TestGroup[];
  columns: ColumnDef<AppTableFeatures, VisualTestItem>[];
  defaultAccordionValues: string[];
  selectable?: boolean;
  selectedNames?: string[];
}>();

const { t } = useI18n();

const emit = defineEmits<{
  rowClick: [test: VisualTestItem];
  toggle: [name: string];
}>();

function isDeletable(group: TestGroup): boolean {
  return group.items.some((item) => !isInheritedOrigin(item.origin));
}

function isSelected(name: string): boolean {
  return (props.selectedNames ?? []).includes(name);
}
</script>

<template>
  <Accordion
    type="multiple"
    :key="defaultAccordionValues.join('|')"
    :default-value="defaultAccordionValues"
  >
    <AccordionItem
      v-for="group in groups"
      :key="group.name"
      :value="group.name"
      class="mb-8"
      :data-testid="TEST_ID.testResultCard"
    >
      <div class="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div class="relative">
          <!-- The checkbox sits in the trigger's left padding instead of inside
               it: a control nested in the collapse button is an interactive
               element inside a button. -->
          <input
            v-if="selectable && isDeletable(group)"
            type="checkbox"
            class="absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 cursor-pointer accent-primary"
            :checked="isSelected(group.name)"
            :aria-label="t('testBulk.selectTest', { test: group.name })"
            :data-testid="TEST_ID.testSelectRow"
            @change="emit('toggle', group.name)"
          />
          <AccordionTrigger
            class="py-3 bg-muted/30 rounded-t-xl hover:bg-muted/50 no-underline"
            :class="selectable && isDeletable(group) ? 'pl-12 pr-6' : 'px-6'"
          >
            <div class="flex w-full items-center justify-between">
              <span class="text-[15px] font-semibold">{{ group.name }}</span>

              <div class="flex items-center gap-2">
                <component
                  v-for="badge in group.badges"
                  :key="badge.status"
                  :is="
                    getStatusCountBadge(badge.status, badge.count, {
                      icon: badge.icon,
                      className: 'py-0.5 px-1.5',
                    })
                  "
                />
              </div>
            </div>
          </AccordionTrigger>
        </div>

        <AccordionContent class="border-t bg-background/50 p-0">
          <DataTable
            :columns="columns"
            :data="group.items"
            class="rounded-b-xl"
            @rowClick="(t: VisualTestItem) => emit('rowClick', t)"
          />
        </AccordionContent>
      </div>
    </AccordionItem>
  </Accordion>
</template>
