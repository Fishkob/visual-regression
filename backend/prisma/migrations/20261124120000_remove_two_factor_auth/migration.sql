-- Remove TOTP two-factor authentication (ADR-068).
--
-- The product does not offer a second factor any more, so the tables that
-- backed it and the per-user seed have no reader left. Dropping them is the
-- point of the migration: a stored TOTP seed is a credential, and leaving it
-- behind after the feature is gone would keep the material that the removed
-- encryption path (ADR-062) existed to protect.

-- DropTable
DROP TABLE "TwoFactorChallenge";
DROP TABLE "RecoveryCode";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "totpSecret",
DROP COLUMN "totpEnabledAt";
