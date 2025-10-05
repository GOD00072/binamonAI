
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatHistoryAI" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageId" TEXT,
    "products" TEXT,
    "senderProfile" TEXT,
    "source" TEXT,
    "timestamp" BIGINT NOT NULL,
    "saved_at" BIGINT
);
INSERT INTO "new_ChatHistoryAI" ("content", "id", "role", "timestamp", "userId") SELECT "content", "id", "role", "timestamp", "userId" FROM "ChatHistoryAI";
DROP TABLE "ChatHistoryAI";
ALTER TABLE "new_ChatHistoryAI" RENAME TO "ChatHistoryAI";
CREATE INDEX "ChatHistoryAI_userId_idx" ON "ChatHistoryAI"("userId");
CREATE INDEX "ChatHistoryAI_messageId_idx" ON "ChatHistoryAI"("messageId");
CREATE INDEX "ChatHistoryAI_timestamp_idx" ON "ChatHistoryAI"("timestamp");
CREATE TABLE "new_ChatHistoryAPI" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "products" TEXT,
    "senderProfile" TEXT,
    "source" TEXT,
    "timestamp" BIGINT NOT NULL,
    "saved_at" BIGINT
);
INSERT INTO "new_ChatHistoryAPI" ("content", "id", "messageId", "source", "timestamp", "userId") SELECT "content", "id", "messageId", "source", "timestamp", "userId" FROM "ChatHistoryAPI";
DROP TABLE "ChatHistoryAPI";
ALTER TABLE "new_ChatHistoryAPI" RENAME TO "ChatHistoryAPI";
CREATE UNIQUE INDEX "ChatHistoryAPI_messageId_key" ON "ChatHistoryAPI"("messageId");
CREATE INDEX "ChatHistoryAPI_userId_idx" ON "ChatHistoryAPI"("userId");
CREATE INDEX "ChatHistoryAPI_messageId_idx" ON "ChatHistoryAPI"("messageId");
CREATE INDEX "ChatHistoryAPI_timestamp_idx" ON "ChatHistoryAPI"("timestamp");
CREATE TABLE "new_ProductHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "category" TEXT,
    "relevance_score" REAL NOT NULL,
    "context" TEXT,
    "timestamp" BIGINT NOT NULL
);
INSERT INTO "new_ProductHistory" ("id", "product_id", "timestamp") SELECT "id", "product_id", "timestamp" FROM "ProductHistory";
DROP TABLE "ProductHistory";
ALTER TABLE "new_ProductHistory" RENAME TO "ProductHistory";
CREATE INDEX "ProductHistory_userId_idx" ON "ProductHistory"("userId");
CREATE INDEX "ProductHistory_product_id_idx" ON "ProductHistory"("product_id");
CREATE INDEX "ProductHistory_timestamp_idx" ON "ProductHistory"("timestamp");
CREATE UNIQUE INDEX "ProductHistory_userId_product_id_timestamp_key" ON "ProductHistory"("userId", "product_id", "timestamp");
CREATE TABLE "new_UserLanguage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "firstDetected" TEXT,
    "conversationStarted" BOOLEAN NOT NULL DEFAULT false,
    "detectionHistory" TEXT,
    "lastUpdateTime" BIGINT,
    "createdAt" BIGINT,
    "version" TEXT DEFAULT '2.0'
);
INSERT INTO "new_UserLanguage" ("id", "language", "userId") SELECT "id", "language", "userId" FROM "UserLanguage";
DROP TABLE "UserLanguage";
ALTER TABLE "new_UserLanguage" RENAME TO "UserLanguage";
CREATE UNIQUE INDEX "UserLanguage_userId_key" ON "UserLanguage"("userId");
CREATE INDEX "UserLanguage_userId_idx" ON "UserLanguage"("userId");
CREATE INDEX "UserLanguage_language_idx" ON "UserLanguage"("language");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
