import fs from "fs/promises";
import { prisma } from "../src/lib/prisma.js";
import { v7 as uuidv7 } from "uuid";
import { Profile } from "../src/types.js";

async function main() {
  console.log("Reading seed file...");
  const rawData = await fs.readFile(
    new URL("./seed_profiles.json", import.meta.url),
    "utf-8",
  );

  const { profiles } = JSON.parse(rawData);
  console.log(`Finished reading. Found ${profiles.length} profiles.`);

  const records = profiles.map((p: Profile) => ({
    ...p,
    id: uuidv7(),
  }));

  console.log("Seeding Database...");

  const result = await prisma.profile.createMany({
    data: records,
    skipDuplicates: true,
  });

  console.log(
    `Seeding complete! Successfully inserted ${result.count} records.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
