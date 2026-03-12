const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("Starting password encryption migration...");

    // 1. Handle Users
    const users = await prisma.user.findMany();
    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        if (!user.password.startsWith("$2a$") && !user.password.startsWith("$2b$")) {
            console.log(`Encrypting password for User: ${user.email}`);
            const hashedPassword = await bcrypt.hash(user.password, 10);
            await prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword }
            });
        } else {
            console.log(`User ${user.email} already has an encrypted password. Skipping.`);
        }
    }

    // 2. Handle Staffs
    const staffs = await prisma.staff.findMany();
    console.log(`Found ${staffs.length} staff records.`);

    for (const staff of staffs) {
        if (!staff.password.startsWith("$2a$") && !staff.password.startsWith("$2b$")) {
            console.log(`Encrypting password for Staff: ${staff.email}`);
            const hashedPassword = await bcrypt.hash(staff.password, 10);
            await prisma.staff.update({
                where: { id: staff.id },
                data: { password: hashedPassword }
            });
        } else {
            console.log(`Staff ${staff.email} already has an encrypted password. Skipping.`);
        }
    }

    console.log("Migration completed successfully.");
}

main()
    .catch((e) => {
        console.error("Migration failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
