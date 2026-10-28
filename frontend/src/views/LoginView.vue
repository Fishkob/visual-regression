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
    <h1 class="text-2xl font-semibold">
      {{ step === "password" ? t("login.signIn") : t("login.twoFactorTitle") }}
    </h1>

    <form
      v-if="step === 'password'"
      class="w-80 space-y-4"
      @submit.prevent="submit"
    >
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

    <form v-else class="w-80 space-y-4" @submit.prevent="verify">
      <p class="text-sm text-muted-foreground">
        {{ t("login.twoFactorHelp") }}
      </p>
      <div class="space-y-1">
        <label for="login-two-factor-code" class="block text-sm">{{
          t("login.code")
        }}</label>
        <Input
          id="login-two-factor-code"
          v-model="code"
          type="text"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          placeholder="123456 or XXXX-XXXX"
          :data-testid="TEST_ID.loginTwoFactorCode"
          class="w-full font-mono tracking-widest"
        />
      </div>
      <Button
        type="submit"
        :data-testid="TEST_ID.loginTwoFactorSubmit"
        :disabled="verifying || !code.trim()"
        class="w-full"
      >
        {{ verifying ? t("login.verifying") : t("login.verify") }}
      </Button>
      <p
        v-if="twoFactorError"
        class="text-sm text-destructive"
        :data-testid="TEST_ID.loginTwoFactorError"
      >
        {{ twoFactorError }}
      </p>
      <Button
        type="button"
        variant="ghost"
        class="w-full"
        :data-testid="TEST_ID.loginTwoFactorBack"
        @click="backToPassword"
      >
        {{ t("login.back") }}
      </Button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, unref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin, useVerifyTwoFactor } from "@/composables/useAuth";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const username = ref("");
const password = ref("");
const errorText = ref("");

// The challenge token is component state only: it is short-lived, belongs to
// this tab and is useless without the code, so it is neither persisted nor put
// in the URL.
const step = ref<"password" | "twoFactor">("password");
const challengeToken = ref("");
const code = ref("");
const twoFactorError = ref("");

const login = useLogin();
const verifyTwoFactor = useVerifyTwoFactor();
const pending = computed(() => unref(login.isPending));
const verifying = computed(() => unref(verifyTwoFactor.isPending));

async function submit(): Promise<void> {
  errorText.value = "";
  try {
    const result = await login.mutateAsync({
      username: username.value,
      password: password.value,
    });
    if (result.kind === "challenge") {
      // No session yet: hold the token and swap to the code step. The session
      // entry (and navigation) happens only after a successful verify.
      challengeToken.value = result.challengeToken;
      code.value = "";
      twoFactorError.value = "";
      step.value = "twoFactor";
    }
  } catch {
    errorText.value = t("login.invalidCredentials");
  }
}

async function verify(): Promise<void> {
  twoFactorError.value = "";
  try {
    await verifyTwoFactor.mutateAsync({
      challengeToken: challengeToken.value,
      code: code.value.trim(),
    });
  } catch (error) {
    twoFactorError.value = sdkErrorMessage(
      error,
      "Invalid two-factor code. Try again.",
    );
  }
}

function backToPassword(): void {
  step.value = "password";
  challengeToken.value = "";
  code.value = "";
  twoFactorError.value = "";
  password.value = "";
}
</script>
