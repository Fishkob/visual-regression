<template>
  <div class="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
    <div class="flex flex-col items-center gap-2">
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        class="h-12 w-12 dark:invert"
      />
      <p
        class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
      >
        Visual Regression
      </p>
    </div>
    <h1 class="text-2xl font-semibold">{{ t("login.signIn") }}</h1>

    <form class="w-80 space-y-4" @submit.prevent="submit">
      <div class="space-y-1">
        <label for="login-username" class="block text-sm">{{
          t("login.username")
        }}</label>
        <Input
          id="login-username"
          v-model="username"
          type="text"
          autocomplete="username"
          :data-testid="TEST_ID.loginUsername"
          class="w-full"
        />
      </div>
      <div class="space-y-1">
        <label for="login-password" class="block text-sm">{{
          t("login.password")
        }}</label>
        <Input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          :data-testid="TEST_ID.loginPassword"
          class="w-full"
        />
      </div>
      <Button
        type="submit"
        :data-testid="TEST_ID.loginSubmit"
        :disabled="pending"
        class="w-full"
      >
        {{ pending ? t("login.signingIn") : t("login.signIn") }}
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
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const username = ref("");
const password = ref("");
const errorText = ref("");

const login = useLogin();
const pending = computed(() => unref(login.isPending));

async function submit(): Promise<void> {
  errorText.value = "";
  try {
    await login.mutateAsync({
      username: username.value,
      password: password.value,
    });
  } catch {
    errorText.value = t("login.invalidCredentials");
  }
}
</script>
