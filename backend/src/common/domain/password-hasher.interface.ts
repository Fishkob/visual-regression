export const PASSWORD_HASHER = 'PASSWORD_HASHER';

export interface PasswordHasherPort {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, stored: string): Promise<boolean>;
}
