require("dotenv").config();
const prisma = require("./src/lib/prisma");

async function seed() {
    console.log("Seeding branches...");

    const systemBranch = await prisma.branch.upsert({
        where: { name: "System Branch" },
        update: {},
        create: {
            name: "System Branch"
        }
    });

    console.log("✓ Branch created/updated: System Branch");
    console.log("Seeding completed!");
    process.exit(0);
}

seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
