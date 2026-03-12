require("dotenv").config();
const prisma = require("./src/lib/prisma");

const nigerianHolidays = [
    { name: "New Year's Day", date: "2026-01-01" },
    { name: "Eid-el-Fitr (Expected)", date: "2026-03-20" },
    { name: "Eid-el-Fitr Holiday (Expected)", date: "2026-03-21" },
    { name: "Good Friday", date: "2026-04-03" },
    { name: "Easter Monday", date: "2026-04-06" },
    { name: "Workers' Day", date: "2026-05-01" },
    { name: "Eid-el-Kabir (Expected)", date: "2026-05-27" },
    { name: "Eid-el-Kabir Holiday (Expected)", date: "2026-05-28" },
    { name: "Democracy Day", date: "2026-06-12" },
    { name: "Eid-el-Maulud (Expected)", date: "2026-08-25" },
    { name: "Independence Day", date: "2026-10-01" },
    { name: "Christmas Day", date: "2026-12-25" },
    { name: "Boxing Day", date: "2026-12-26" },
];

async function seed() {
    console.log("Seeding holidays...");
    for (const holiday of nigerianHolidays) {
        await prisma.holiday.upsert({
            where: { date: new Date(holiday.date) },
            update: { name: holiday.name },
            create: {
                name: holiday.name,
                date: new Date(holiday.date)
            },
        });
    }
    console.log("Seeding completed!");
    process.exit(0);
}

seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
