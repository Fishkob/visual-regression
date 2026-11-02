-- The comparison job's retry budget is minutes (see retry-policy.ts): five
-- attempts with a 30 s base and a 5 min cap. Existing rows keep the budget they
-- were enqueued with; only new rows inherit the wider default.
ALTER TABLE "ComparisonJob" ALTER COLUMN "maxAttempts" SET DEFAULT 5;
