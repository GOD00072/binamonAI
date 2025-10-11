-- Add isActive column to AuthUser with default true (1)
PRAGMA foreign_keys=OFF;
ALTER TABLE "AuthUser" ADD COLUMN "isActive" INTEGER NOT NULL DEFAULT 1;
PRAGMA foreign_keys=ON;
