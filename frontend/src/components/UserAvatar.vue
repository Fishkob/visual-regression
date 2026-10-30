<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    // A username (or any principal label). Avatars are decorative: the name is
    // always rendered next to them, so the initials never carry information on
    // their own and stay out of the accessibility tree.
    name: string;
    size?: "sm" | "md";
  }>(),
  { size: "md" },
);

const initials = computed(() => {
  const parts = props.name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
});
</script>

<template>
  <span
    aria-hidden="true"
    :class="
      cn(
        'flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-1 ring-border select-none',
        size === 'sm' ? 'size-6 text-[10px]' : 'size-7 text-[11px]',
      )
    "
  >
    {{ initials }}
  </span>
</template>
