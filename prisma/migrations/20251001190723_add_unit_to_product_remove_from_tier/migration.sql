-- AlterTable: Add unit column to Product
ALTER TABLE "Product" ADD COLUMN "unit" TEXT;

-- RedefineTables: Remove unit from PriceTier
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Create new PriceTier table without unit column
CREATE TABLE "new_PriceTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "max_quantity" INTEGER,
    "price" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL,
    CONSTRAINT "PriceTier_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy data from old table (excluding unit column)
INSERT INTO "new_PriceTier" ("id", "product_id", "min_quantity", "max_quantity", "price", "created_at", "last_updated")
SELECT "id", "product_id", "min_quantity", "max_quantity", "price", "created_at", "last_updated" FROM "PriceTier";

-- Drop old table
DROP TABLE "PriceTier";

-- Rename new table
ALTER TABLE "new_PriceTier" RENAME TO "PriceTier";

-- Recreate indexes
CREATE INDEX "PriceTier_product_id_idx" ON "PriceTier"("product_id");
CREATE INDEX "PriceTier_min_quantity_idx" ON "PriceTier"("min_quantity");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
