require("dotenv").config();
const prisma = require("./src/lib/prisma");

async function seed() {
    console.log("Seeding roles...");

    const superAdminRole = await prisma.role.upsert({
        where: { name: "Super Admin" },
        update: { rank: 10 },
        create: {
            name: "Super Admin",
            rank: 10
        }
    });

    console.log("✓ Role created/updated: Super Admin (rank: 10)");
    console.log("Seeding completed!");
    process.exit(0);
}

seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
