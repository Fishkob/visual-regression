<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChangePassword, useLogout } from "@/composables/useAuth";
import { sdkErrorMessage } from "@/lib/sdk";
import { TEST_ID } from "@/lib/test-ids";

const MIN_PASSWORD_LENGTH = 8;

const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");

const { mutateAsync, isPending, error } = useChangePassword();
const { mutate: logout } = useLogout();

const pending = computed(() => isPending.value);
const tooShort = computed(
  () =>
    newPassword.value.length > 0 &&
    newPassword.value.length < MIN_PASSWORD_LENGTH,
);
const mismatch = computed(
  () =>
    confirmPassword.value.length > 0 &&
    confirmPassword.value !== newPassword.value,
);
const canSubmit = computed(
  () =>
    currentPassword.value.length > 0 &&
    newPassword.value.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.value === newPassword.value,
);
const errorText = computed(() =>
  error.value
    ? sdkErrorMessage(error.value, "Could not change the password")
    : "",
);

// The mutation owns the toast and the redirect; the view only surfaces the
// validation and the server's message (e.g. "Current password is incorrect").
async function submit() {
  if (!canSubmit.value) return;
  try {
    await mutateAsync({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
  } catch {
    /* the error ref renders the message */
  }
}
</script>

<template>
  <div
    class="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center space-y-6"
    :data-testid="TEST_ID.changePasswordView"
  >
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        Choose a new password
      </h1>
      <p class="text-sm text-muted-foreground">
        Your account has a temporary password. Set your own before you continue
        to the review inbox.
      </p>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <div class="space-y-1">
        <label for="change-password-current" class="block text-sm">
          Current password
        </label>
        <Input
          id="change-password-current"
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          :data-testid="TEST_ID.changePasswordCurrent"
          class="w-full"
        />
      </div>

      <div class="space-y-1">
        <label for="change-password-new" class="block text-sm">
          New password
        </label>
        <Input
          id="change-password-new"
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          :minlength="MIN_PASSWORD_LENGTH"
          :aria-invalid="tooShort"
          :data-testid="TEST_ID.changePasswordNew"
          class="w-full"
        />
        <p v-if="tooShort" class="text-xs text-destructive" role="alert">
          Use at least {{ MIN_PASSWORD_LENGTH }} characters.
        </p>
      </div>

      <div class="space-y-1">
        <label for="change-password-confirm" class="block text-sm">
          Confirm new password
        </label>
        <Input
          id="change-password-confirm"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          :aria-invalid="mismatch"
          :data-testid="TEST_ID.changePasswordConfirm"
          class="w-full"
        />
        <p v-if="mismatch" class="text-xs text-destructive" role="alert">
          The new passwords do not match.
        </p>
      </div>

      <p v-if="errorText" class="text-sm text-destructive" role="alert">
        {{ errorText }}
      </p>

      <Button
        type="submit"
        class="w-full"
        :disabled="!canSubmit || pending"
        :data-testid="TEST_ID.changePasswordSubmit"
      >
        {{ pending ? "Updating…" : "Update password" }}
      </Button>
    </form>

    <button
      type="button"
      class="self-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      @click="logout()"
    >
      Log out
    </button>
  </div>
</template>
