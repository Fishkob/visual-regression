import { SetMetadata } from '@nestjs/common';

export const ACCOUNT_LIFECYCLE_KEY = 'auth:account-lifecycle';

// Marks the account-lifecycle surface — the routes a caller must be able to
// reach *while their account is not in a usable state*: signing out, reading who
// they are, changing the password that is forcing the change, and managing their
// own sessions.
//
// The global guard exempts these from two rules: the VIEWER write-ban (a viewer
// must still be able to log out) and the must-change-password gate (the screen
// that fixes the state has to stay reachable). It is a decorator rather than a
// path check on purpose: the previous `path.includes('/auth/')` also matched a
// project, test or run literally named `auth`, which handed a VIEWER write
// access to that project's branches and bypassed the password gate.
export const AccountLifecycle = () => SetMetadata(ACCOUNT_LIFECYCLE_KEY, true);
