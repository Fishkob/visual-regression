-- CreateEnum
CREATE TYPE "ImageSizePolicy" AS ENUM ('FAIL', 'PAD', 'CROP', 'RESIZE');

-- AlterTable
ALTER TABLE "UnifiedTest" ADD COLUMN     "sizePolicy" "ImageSizePolicy" NOT NULL DEFAULT 'FAIL';

