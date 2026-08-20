-- DropForeignKey
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_nominationId_fkey";

-- DropForeignKey
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_photoId_fkey";

-- AlterTable
ALTER TABLE "Nomination" DROP CONSTRAINT "Nomination_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Nomination_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Photo" DROP CONSTRAINT "Photo_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Photo_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Vote" DROP COLUMN "photoId",
ADD COLUMN     "photoId" INTEGER NOT NULL,
DROP COLUMN "nominationId",
ADD COLUMN     "nominationId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Vote_nominationId_photoId_idx" ON "Vote"("nominationId", "photoId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_userId_photoId_nominationId_key" ON "Vote"("userId", "photoId", "nominationId");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "Nomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
