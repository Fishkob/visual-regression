-- Existing installations predate roles: the first user is the bootstrap admin.
UPDATE "User"
SET "role" = 'ADMIN'
WHERE "id" = (
  SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "User" WHERE "role" = 'ADMIN');
