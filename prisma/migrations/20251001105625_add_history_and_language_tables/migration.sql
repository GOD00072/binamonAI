-- CreateTable
CREATE TABLE "ChatHistoryAI" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChatHistoryAPI" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "imageUrl" TEXT,
    "stickerPackageId" TEXT,
    "stickerId" TEXT,
    "source" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field_name" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT,
    "change_reason" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserLanguage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "language_name" TEXT,
    "auto_detect" BOOLEAN NOT NULL DEFAULT true,
    "preferences" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ChatHistoryAI_userId_idx" ON "ChatHistoryAI"("userId");

-- CreateIndex
CREATE INDEX "ChatHistoryAI_timestamp_idx" ON "ChatHistoryAI"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ChatHistoryAPI_messageId_key" ON "ChatHistoryAPI"("messageId");

-- CreateIndex
CREATE INDEX "ChatHistoryAPI_userId_idx" ON "ChatHistoryAPI"("userId");

-- CreateIndex
CREATE INDEX "ChatHistoryAPI_messageId_idx" ON "ChatHistoryAPI"("messageId");

-- CreateIndex
CREATE INDEX "ChatHistoryAPI_timestamp_idx" ON "ChatHistoryAPI"("timestamp");

-- CreateIndex
CREATE INDEX "ProductHistory_product_id_idx" ON "ProductHistory"("product_id");

-- CreateIndex
CREATE INDEX "ProductHistory_action_idx" ON "ProductHistory"("action");

-- CreateIndex
CREATE INDEX "ProductHistory_timestamp_idx" ON "ProductHistory"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "UserLanguage_userId_key" ON "UserLanguage"("userId");

-- CreateIndex
CREATE INDEX "UserLanguage_userId_idx" ON "UserLanguage"("userId");

-- CreateIndex
CREATE INDEX "UserLanguage_language_idx" ON "UserLanguage"("language");
