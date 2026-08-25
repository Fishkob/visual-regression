import { AppConfigService } from '@config/app-config.service';
import { AppLoggerService } from '@common/logging/app-logger.service';
import { AuthRepository } from './auth.repository';

export async function bootstrapAdmin(
  repo: AuthRepository,
  hasher: { hashPassword(password: string): Promise<string> },
  appConfig: AppConfigService,
  logger: AppLoggerService,
): Promise<void> {
  const { bootstrapAdminUsername, bootstrapAdminPassword } = appConfig.auth;
  if (!bootstrapAdminUsername || !bootstrapAdminPassword) return;

  const existing = await repo.countUsers();
  if (existing > 0) return;

  const passwordHash = await hasher.hashPassword(bootstrapAdminPassword);
  await repo.createUser(bootstrapAdminUsername, passwordHash);
  logger.warn(
    `Bootstrapped admin user "${bootstrapAdminUsername}" from env. Remove BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD after first boot.`,
  );
}
