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
defineProps<{
  deleteLabel: string;
  testId: string;
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
  <div class="flex justify-end pr-4" @click.stop>
    <DropdownMenu v-model:open="open">
      <DropdownMenuTrigger as-child>
        <slot name="trigger">
          <span
            class="p-2 rounded-md hover:bg-muted cursor-pointer inline-flex items-center justify-center"
            :data-testid="testId"
          >
            <MoreVertical class="w-4 h-4" />
          </span>
        </slot>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        class="w-40"
        @close-auto-focus.prevent
        @interact-outside="open = false"
      >
        <DropdownMenuItem
          class="text-red-600 focus:text-red-600 cursor-pointer"
          @click="handleSelect"
        >
          <Trash2 class="w-4 h-4 mr-2" />
          {{ deleteLabel }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
