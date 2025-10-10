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
    "text_model_name" TEXT NOT NULL DEFAULT 'gpt-4',
    "max_tokens" INTEGER NOT NULL DEFAULT 2000,
    "image_model_name" TEXT DEFAULT 'gemini-pro-vision',
    "image_prompt" TEXT DEFAULT 'ช่วยอธิบายรูปภาพนี้อย่างละเอียด',
    "text_api_key" TEXT,
    "image_api_key" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);
INSERT INTO "new_ContextWindow" ("created_at", "id", "image_api_key", "image_model_name", "image_prompt", "include_user_history", "last_updated", "max_context_messages", "max_tokens", "name", "system_prompt", "temperature", "text_api_key", "use_knowledge_rag", "use_product_rag") SELECT "created_at", "id", "image_api_key", "image_model_name", "image_prompt", "include_user_history", "last_updated", "max_context_messages", "max_tokens", "name", "system_prompt", "temperature", "text_api_key", "use_knowledge_rag", "use_product_rag" FROM "ContextWindow";
DROP TABLE "ContextWindow";
ALTER TABLE "new_ContextWindow" RENAME TO "ContextWindow";
CREATE UNIQUE INDEX "ContextWindow_name_key" ON "ContextWindow"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;