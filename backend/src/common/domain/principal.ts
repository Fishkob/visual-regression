// The identity behind a request. A session identifies a user, a CI key
// identifies the key itself; routes that act *as* a person (my assignments,
// comment authorship) check the type instead of trusting the display name.
export type PrincipalType = 'user' | 'apiKey';

export interface Principal {
  principalType: PrincipalType;
  principalId: string;
}
