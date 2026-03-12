const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const prisma = require('../lib/prisma');

exports.migrateCustomers = async (req, res) => {
    const filePath = path.join(__dirname, '../../customers.csv');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "customers.csv not found in backend root" });
    }

    const results = [];
    const errors = [];
    let successCount = 0;

    // Use a promise to wait for CSV parsing
    const rows = await new Promise((resolve, reject) => {
        const data = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => data.push(row))
            .on('end', () => resolve(data))
            .on('error', (err) => reject(err));
    });

    console.log(`CSV parsing finished. Processing ${rows.length} rows...`);

    for (const row of rows) {
        try {
            // Validate basic required fields
            if (!row.surname || !row.firstname || !row.phoneNumber) {
                errors.push({ row: row.surname || "Unknown", error: "Missing basic info (surname, firstname, or phone)" });
                continue;
            }

            // Search for existing customer to avoid duplicates
            const existing = await prisma.customer.findFirst({
                where: {
                    OR: [
                        { phoneNumber: row.phoneNumber },
                        (row.email && row.email.trim() !== "") ? { email: row.email } : undefined,
                        (row.bvn && row.bvn.trim() !== "") ? { bvn: row.bvn } : undefined
                    ].filter(Boolean)
                }
            });

            if (existing) {
                // errors.push({ row: row.surname, error: "Customer already exists" });
                continue; // Skip silently if already exists or log it
            }

            // Handle MeansOfId enum
            let meansOfId = "OTHERS";
            const validMeans = ["NATIONAL_ID", "INTL_PASSPORT", "DRIVERS_LICENSE", "VOTERS_CARD", "OTHERS"];
            if (row.means_of_id && validMeans.includes(row.means_of_id.trim())) {
                meansOfId = row.means_of_id.trim();
            }

            // Handle date
            let dob = new Date(row.dob);
            if (isNaN(dob.getTime())) {
                dob = new Date("1990-01-01"); // Fallback for migration
            }

            // Handle branchId and fieldOfficerId
            // Validate if branch exists, otherwise default to first branch or similar
            const branchId = 1;
            const fieldOfficerId = parseInt(row.fieldOfficerId) || null;

            // Check if branch actually exists
            const branchExists = await prisma.branch.findUnique({ where: { id: branchId } });
            const finalBranchId = 2; // Fallback to branch 1

            // Check if officer exists
            let finalOfficerId = null;
            if (fieldOfficerId) {
                const officerExists = await prisma.user.findUnique({ where: { id: fieldOfficerId } });
                if (officerExists) finalOfficerId = fieldOfficerId;
            }

            await prisma.customer.create({
                data: {
                    title: row.title || null,
                    surname: row.surname.trim(),
                    firstname: row.firstname.trim(),
                    gender: row.gender || "Unknown",
                    dob,
                    marital_status: row.marital_status || null,
                    home_address: row.home_address || "N/A",
                    phoneNumber: row.phoneNumber.trim(),
                    email: (row.email && row.email.trim() !== "") ? row.email.trim() : null,
                    nationality: row.nationality || "Nigeria",
                    stateOfOrigin: row.stateOfOrigin || "Unknown",
                    businessName: row.businessName || null,
                    businessAddress: row.businessAddress || null,
                    means_of_id: meansOfId,
                    id_number: row.id_number || "N/A",
                    referrer: row.referrer || null,
                    branchId: finalBranchId,
                    fieldOfficerId: finalOfficerId,
                    bankName: row.bankName || "Unknown",
                    accountNumber: row.accountNumber || "Unknown",
                    bvn: (row.bvn && row.bvn.trim() !== "") ? row.bvn.trim() : null,
                    nextOfKinName: row.nextOfKinName || "N/A",
                    nextOfKinGender: row.nextOfKinGender || "Unknown",
                    nextOfKinRelationship: row.nextOfKinRelationship || "N/A",
                    nextOfKinPhoneNumber: row.nextOfKinPhoneNumber || "N/A",
                    nextOfKinAddress: row.nextOfKinAddress || "N/A",
                    customers_assets: row.customers_assets || null,
                    value_of_goods: parseFloat(row.value_of_goods) || 0,
                    guarantorName: row.guarantorName || "N/A",
                    guarantorPhoneNumber: row.guarantorPhoneNumber || "N/A",
                    guarantorAddress: row.guarantorAddress || "N/A",
                    guarantorBusinessAddress: row.guarantorBusinessAddress || "N/A",
                    relationshipWithBorrower: row.relationshipWithBorrower || "N/A",
                    guarantorOccupation: row.guarantorOccupation || "N/A",
                    profilePicture: row.profilePicture || null,
                    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
                    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
                    status: "active"
                }
            });
            successCount++;
        } catch (err) {
            console.error(`Error processing row ${row.surname}:`, err.message);
            errors.push({ row: row.surname, error: err.message });
        }
    }

    res.json({
        success: true,
        message: "Migration completed",
        processed: rows.length,
        successCount,
        errorCount: errors.length,
        errors: errors.slice(0, 10) // Return first 10 errors if any
    });
};
