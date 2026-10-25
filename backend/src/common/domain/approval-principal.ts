// The identity that casts an approval vote. A vote belongs to a credential, not
// a display name: sessions identify a user, CI keys identify the key itself.
export type ApprovalPrincipalType = 'user' | 'apiKey';

export interface ApprovalPrincipal {
  principalType: ApprovalPrincipalType;
  principalId: string;
}
