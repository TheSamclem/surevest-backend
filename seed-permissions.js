require("dotenv").config();
const prisma = require("./src/lib/prisma");

const defaultPermissions = [
    { slug: "MANAGE_USERS", name: "Manage Users", category: "User Management", description: "Create, Edit, and Delete users" },
    { slug: "VIEW_CUSTOMERS", name: "View Customers", category: "Customer Management", description: "View customer profiles and data" },
    { slug: "MANAGE_CUSTOMERS", name: "Manage Customers", category: "Customer Management", description: "Edit and Delete customers" },
    { slug: "MANAGE_LOANS", name: "Manage Loans", category: "Loan Management", description: "Create, Approve, and Manage loans" },
    { slug: "VIEW_REPORTS", name: "View Reports", category: "Reports", description: "Access to high-level system reports" },
    { slug: "MANAGE_BRANCHES", name: "Manage Branches", category: "System Settings", description: "Create and Edit branch details" },
    { slug: "MANAGE_HOLIDAYS", name: "Manage Holidays", category: "System Settings", description: "Update holiday calendar" },
    { slug: "MANAGE_PERMISSIONS", name: "Manage Permissions", category: "System Settings", description: "Assign permissions to roles and users" },
];

async function seed() {
    console.log("Seeding permissions...");
    for (const perm of defaultPermissions) {
        await prisma.permission.upsert({
            where: { slug: perm.slug },
            update: { ...perm },
            create: { ...perm },
        });
    }
    console.log("Seeding completed!");
    process.exit(0);
}

seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
