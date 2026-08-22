<script setup lang="ts">
import { Primitive } from "reka-ui";
import { cn } from "@/lib/utils";
import { badgeVariants } from ".";
import type { BadgeVariants } from ".";
import type { HTMLAttributes } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariants["variant"];
    class?: HTMLAttributes["class"];
    as?: string;
    asChild?: boolean;
  }>(),
  {
    as: "div",
    asChild: false,
    variant: "default",
  },
);
</script>

<template>
  <Primitive
    data-slot="badge"
    :as="props.as"
    :as-child="props.asChild"
    :class="cn(badgeVariants({ variant: props.variant }), props.class)"
  >
    <slot />
  </Primitive>
</template>
