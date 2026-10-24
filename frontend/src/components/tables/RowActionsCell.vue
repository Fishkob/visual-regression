<script setup lang="ts">
import { ref } from "vue";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { MoreVertical, Trash2 } from "@lucide/vue";

// Single owner of the row-actions overflow menu: an open-state DropdownMenu with
// a destructive delete item. Tables pass the delete label, a testid, and their
// own trigger markup via the `trigger` slot; the menu behaviour has one home
// instead of a near-identical copy per table. The delete target is the caller's
// concern — it binds its own requestDelete against the row it rendered.
// `readOnly` suppresses the menu entirely for rows the caller cannot mutate
// (e.g. a test inherited from another branch).
defineProps<{
  deleteLabel: string;
  testId: string;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  (e: "requestDelete"): void;
}>();

const open = ref(false);

function handleSelect() {
  emit("requestDelete");
  open.value = false;
}
</script>

<template>
  <div v-if="!readOnly" class="flex justify-end pr-4" @click.stop>
    <DropdownMenu v-model:open="open">
      <DropdownMenuTrigger as-child>
        <slot name="trigger">
          <button
            type="button"
            class="p-2 rounded-md hover:bg-muted cursor-pointer inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Row actions"
            :data-testid="testId"
          >
            <MoreVertical class="w-4 h-4" />
          </button>
        </slot>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        class="w-40"
        @close-auto-focus.prevent
        @interact-outside="open = false"
      >
        <DropdownMenuItem
          class="text-status-danger focus:text-status-danger cursor-pointer"
          @click="handleSelect"
        >
          <Trash2 class="w-4 h-4 mr-2" />
          {{ deleteLabel }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
