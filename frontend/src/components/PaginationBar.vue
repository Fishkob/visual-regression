<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";

defineProps<{
  page: number;
  pageCount: number;
  total: number;
  itemLabel?: string;
}>();

const emit = defineEmits<{
  "update:page": [value: number];
}>();
</script>

<template>
  <nav
    class="flex flex-wrap items-center justify-between gap-3 pt-2"
    aria-label="Pagination"
  >
    <Button
      variant="outline"
      size="sm"
      :disabled="page <= 1"
      :data-testid="TEST_ID.paginationPrev"
      @click="emit('update:page', page - 1)"
    >
      Previous
    </Button>

    <p
      class="text-sm text-muted-foreground"
      :data-testid="TEST_ID.paginationStatus"
    >
      Page {{ page }} of {{ pageCount }} · {{ total }}
      {{ itemLabel ?? "items" }}
    </p>

    <Button
      variant="outline"
      size="sm"
      :disabled="page >= pageCount"
      :data-testid="TEST_ID.paginationNext"
      @click="emit('update:page', page + 1)"
    >
      Next
    </Button>
  </nav>
</template>
