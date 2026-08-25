<template>
  <div class="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
    <h1 class="text-2xl font-semibold">Sign in</h1>
    <form class="w-80 space-y-4" @submit.prevent="submit">
      <Input
        v-model="username"
        type="text"
        placeholder="Username"
        autocomplete="username"
        :data-testid="TEST_ID.loginUsername"
        class="w-full"
      />
      <Input
        v-model="password"
        type="password"
        placeholder="Password"
        autocomplete="current-password"
        :data-testid="TEST_ID.loginPassword"
        class="w-full"
      />
      <Button
        type="submit"
        :data-testid="TEST_ID.loginSubmit"
        :disabled="pending"
        class="w-full"
      >
        {{ pending ? "Signing in…" : "Sign in" }}
      </Button>
      <p v-if="errorText" class="text-sm text-destructive">{{ errorText }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, unref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/composables/useAuth";
import { TEST_ID } from "@/lib/test-ids";

const username = ref("");
const password = ref("");
const errorText = ref("");

const { mutateAsync, isPending } = useLogin();
const pending = computed(() => unref(isPending));

async function submit(): Promise<void> {
  errorText.value = "";
  try {
    await mutateAsync({ username: username.value, password: password.value });
  } catch {
    errorText.value = "Invalid username or password";
  }
}
</script>
