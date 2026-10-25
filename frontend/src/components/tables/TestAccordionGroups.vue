<script setup lang="ts">
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
import type { VisualTestItem } from "@/domains/projects/project.model";
import type { TestGroup } from "@/domains/projects/test-group";
import { TEST_ID } from "@/lib/test-ids";

// The defaults are uncontrolled — they only apply on mount — so the template
// keys the accordion on the group set: a group introduced by a filter then
// mounts expanded instead of inheriting the previous set's open items. The price
// is that a filter change re-expands everything, which is the intended default.
defineProps<{
  groups: TestGroup[];
  columns: ColumnDef<AppTableFeatures, VisualTestItem>[];
  defaultAccordionValues: string[];
}>();

const emit = defineEmits<{
  rowClick: [test: VisualTestItem];
}>();
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
        <AccordionTrigger
          class="px-6 py-3 bg-muted/30 rounded-t-xl hover:bg-muted/50 no-underline"
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
