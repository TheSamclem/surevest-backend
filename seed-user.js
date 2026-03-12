require("dotenv").config();
const prisma = require("./src/lib/prisma");

async function seed() {
    console.log("Seeding initial data...");

    // Ensure we have a branch
    const branch = await prisma.branch.upsert({
        where: { name: "Main Branch" },
        update: {},
        create: { name: "Main Branch" }
    });

    // Ensure we have a role
    const role = await prisma.role.upsert({
        where: { name: "Administrator" },
        update: { rank: 5 },
        create: { name: "Administrator", rank: 5 }
    });

    // Create a user
    const user = await prisma.user.upsert({
        where: { email: "admin@findale.com" },
        update: {},
        create: {
            surname: "Root",
            othername: "Admin",
            gender: "Male",
            password: "hashed_password", // In a real app, use bcrypt
            email: "admin@findale.com",
            phoneNumber: "08012345678",
            role_id: role.id,
            branchId: branch.id,
            status: "active"
        }
    });

    console.log("Seeding completed! User created: admin@findale.com");
    process.exit(0);
}

seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
