<script setup lang="ts">
import { Primitive } from "reka-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from ".";
import type { ButtonVariants } from ".";
import type { HTMLAttributes } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants["variant"];
    size?: ButtonVariants["size"];
    class?: HTMLAttributes["class"];
    as?: string;
    asChild?: boolean;
  }>(),
  {
    as: "button",
    asChild: false,
    variant: "default",
    size: "default",
  },
);
</script>

<template>
  <Primitive
    data-slot="button"
    :as="props.as"
    :as-child="props.asChild"
    :class="
      cn(
        buttonVariants({ variant: props.variant, size: props.size }),
        props.class,
      )
    "
  >
    <slot />
  </Primitive>
</template>
