/*
  Warnings:

  - You are about to drop the column `key` on the `ContextWindow` table. All the data in the column will be lost.
  - Added the required column `name` to the `ContextWindow` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContextWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL DEFAULT 'คุณคือผู้ช่วยที่ชาญฉลาดในการให้ข้อมูลเกี่ยวกับสินค้า',
    "use_product_rag" BOOLEAN NOT NULL DEFAULT true,
    "use_knowledge_rag" BOOLEAN NOT NULL DEFAULT true,
    "max_context_messages" INTEGER NOT NULL DEFAULT 10,
    "include_user_history" BOOLEAN NOT NULL DEFAULT true,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "model_name" TEXT NOT NULL DEFAULT 'gpt-4',
    "max_tokens" INTEGER NOT NULL DEFAULT 2000,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);
INSERT INTO "new_ContextWindow" ("created_at", "id", "include_user_history", "last_updated", "max_context_messages", "max_tokens", "model_name", "system_prompt", "temperature", "use_knowledge_rag", "use_product_rag") SELECT "created_at", "id", "include_user_history", "last_updated", "max_context_messages", "max_tokens", "model_name", "system_prompt", "temperature", "use_knowledge_rag", "use_product_rag" FROM "ContextWindow";
DROP TABLE "ContextWindow";
ALTER TABLE "new_ContextWindow" RENAME TO "ContextWindow";
CREATE UNIQUE INDEX "ContextWindow_name_key" ON "ContextWindow"("name");
CREATE TABLE "new_LineOaConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelSecret" TEXT NOT NULL,
    "channelAccessToken" TEXT NOT NULL,
    "contextWindowId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LineOaConfig_contextWindowId_fkey" FOREIGN KEY ("contextWindowId") REFERENCES "ContextWindow" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LineOaConfig" ("channelAccessToken", "channelId", "channelSecret", "createdAt", "id", "name", "updatedAt") SELECT "channelAccessToken", "channelId", "channelSecret", "createdAt", "id", "name", "updatedAt" FROM "LineOaConfig";
DROP TABLE "LineOaConfig";
ALTER TABLE "new_LineOaConfig" RENAME TO "LineOaConfig";
CREATE UNIQUE INDEX "LineOaConfig_name_key" ON "LineOaConfig"("name");
CREATE UNIQUE INDEX "LineOaConfig_channelId_key" ON "LineOaConfig"("channelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
