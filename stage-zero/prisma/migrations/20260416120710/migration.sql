/*
  Warnings:

  - You are about to drop the column `gender_probability` on the `Profile` table. All the data in the column will be lost.
  - Added the required column `probability` to the `Profile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "gender_probability",
ADD COLUMN     "probability" DOUBLE PRECISION NOT NULL;
