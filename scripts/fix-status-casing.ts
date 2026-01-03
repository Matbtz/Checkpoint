
import { prisma } from '../lib/db';

async function main() {
  console.log('Starting status migration to UPPERCASE...');

  const allUserLibraries = await prisma.userLibrary.findMany();
  console.log(`Found ${allUserLibraries.length} library entries.`);

  let updatedCount = 0;

  for (const entry of allUserLibraries) {
    let newStatus = entry.status.toUpperCase();

    // Handle specific mappings
    if (entry.status === "Up Next" || entry.status === "UP_NEXT") {
        newStatus = "BACKLOG";
    }

    if (newStatus !== entry.status) {
      console.log(`Updating ${entry.id}: ${entry.status} -> ${newStatus}`);
      await prisma.userLibrary.update({
        where: { id: entry.id },
        data: { status: newStatus },
      });
      updatedCount++;
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
