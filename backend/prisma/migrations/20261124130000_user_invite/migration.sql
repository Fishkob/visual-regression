-- One-time invite links for newly issued credentials (ADR-075).
--
-- A new account no longer hands its temporary password to the creating admin:
-- the API mints a link instead, and the reveal endpoint turns the link into the
-- password. This table is the only state that link needs.
--
--   * `tokenHash` — SHA-256 of the token in the URL. The token itself is never
--     stored, like every other bearer credential in this schema.
--   * `consumedAt` — set by the first successful reveal. The row is kept rather
--     than deleted, so "this link was already used" and "this link never
--     existed" stay different answers.
--   * `userId` is unique: `POST /users` and `POST /users/:id/reset-password`
--     replace the outstanding invite, so an older link cannot reveal a password
--     that a newer one supersedes.
--
-- The password is derived from the token on reveal and never written down, so
-- this table deliberately has no password column.

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_userId_key" ON "UserInvite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_tokenHash_key" ON "UserInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "UserInvite_expiresAt_idx" ON "UserInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
