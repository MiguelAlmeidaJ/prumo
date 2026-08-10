-- Existing accounts already have a usable password hash.
UPDATE "User"
SET "passwordSetAt" = "createdAt"
WHERE "passwordSetAt" IS NULL;
