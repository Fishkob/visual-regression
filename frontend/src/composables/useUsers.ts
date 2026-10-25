import type { QueryClient } from "@tanstack/vue-query";
import {
  usersControllerCreate,
  usersControllerList,
  usersControllerResetPassword,
  usersControllerUpdate,
  type CreatedUserDto,
  type ResetPasswordResultDto,
  type UserDto,
} from "@sdk";
import { useSdkMutation } from "@/composables/useSdkMutation";
import { useSdkQuery } from "@/composables/useDomainQuery";
import { mapUsers } from "@/domains/users/user.mapper";
import type {
  CreateUserInput,
  UpdateUserInput,
} from "@/domains/users/user.model";
import { userQueryKeys } from "@/domains/users/query-keys";

export function useUsersQuery() {
  return useSdkQuery({
    args: {},
    required: [],
    keyOf: () => userQueryKeys.list(),
    sdkFn: () => usersControllerList(),
    map: (data: UserDto[] | undefined) => mapUsers(data),
  });
}

// Every user write invalidates the whole list: a role change, an activation
// toggle and a reset all move the same row, and the list is one small read.
const invalidateUsers = (client: QueryClient) => {
  client.invalidateQueries({ queryKey: userQueryKeys.all() });
};

// The temporary password is revealed exactly once, so the mutation hands its
// result back to the caller instead of only toasting.
export function useCreateUser() {
  return useSdkMutation<CreatedUserDto, CreateUserInput>({
    mutationFn: (body) => usersControllerCreate({ body }),
    successMessage: "User created",
    errorMessage: "Could not create the user",
    invalidate: invalidateUsers,
  });
}

export function useUpdateUser() {
  return useSdkMutation<UserDto, UpdateUserInput>({
    mutationFn: ({ id, role, isActive }) =>
      usersControllerUpdate({
        path: { id },
        body: {
          ...(role ? { role } : {}),
          ...(isActive === undefined ? {} : { isActive }),
        },
      }),
    successMessage: (user) =>
      user.isActive ? "User reactivated" : "User deactivated",
    errorMessage: "Could not update the user",
    invalidate: invalidateUsers,
  });
}

export function useResetUserPassword() {
  return useSdkMutation<ResetPasswordResultDto, string>({
    mutationFn: (id) => usersControllerResetPassword({ path: { id } }),
    successMessage: "Temporary password issued",
    errorMessage: "Could not reset the password",
    invalidate: invalidateUsers,
  });
}
