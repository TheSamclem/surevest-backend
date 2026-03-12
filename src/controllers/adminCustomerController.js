const prisma = require("../lib/prisma");
const { logActivity } = require("../lib/logger");
const axios = require("axios");
const SAVINGS_SOURCE = {
    deposit: "savings_deposit",
    withdraw: "savings_withdrawal"
};

// Customer Controllers
exports.getCustomers = async (req, res) => {
    try {
        const { fieldOfficerId } = req.query;

        const branchFilter =
            (req.user.rank >= 3 && req.user.rank <= 4)
                ? { branchId: req.user.branchId }
                : {};

        const fieldOfficerFilter = fieldOfficerId
            ? { fieldOfficerId: Number(fieldOfficerId) } // convert to number
            : {};

        const customers = await prisma.customer.findMany({
            where: {
                ...branchFilter,
                ...fieldOfficerFilter
            },
            include: {
                branch: true,
                fieldOfficer: true,
                _count: { select: { loans: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(customers);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
};

// Return customers assigned to an agent. If agentId provided as query param or available on req.user, filter by fieldOfficerId.
exports.getCustomersAssigned = async (req, res) => {
    try {
        const agentIdQuery = req.query.agentId ? parseInt(req.query.agentId) : null;
        const agentId = agentIdQuery || req.user?.id || null;

        const where = {
            ...(agentId ? { fieldOfficerId: parseInt(agentId) } : {}),
            status: "active"
        };

        const customers = await prisma.customer.findMany({
            where,
            include: {
                branch: true,
                fieldOfficer: true,
                _count: { select: { loans: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createCustomer = async (req, res) => {
    try {
        const {
            title, surname, firstname, gender, dob, marital_status,
            home_address, phoneNumber, email, nationality, stateOfOrigin,
            businessName, businessAddress, means_of_id, id_number, referrer,
            fieldOfficerId, branchId, bankName, accountNumber, bvn,
            nextOfKinName, nextOfKinGender, nextOfKinRelationship,
            nextOfKinPhoneNumber, nextOfKinAddress, profilePicture,
            customers_assets, value_of_goods, guarantorName,
            guarantorPhoneNumber, guarantorAddress, guarantorBusinessAddress,
            relationshipWithBorrower, guarantorOccupation
        } = req.body;

        // Import payment controller to use createVirtualAccount helper
        const paymentController = require('./paymentController');

        // Create dedicated Paystack virtual account for the customer
        let paystackData = null;
        if (email && phoneNumber) {
            paystackData = await paymentController.createVirtualAccount(email, firstname, surname, phoneNumber);
        } else {
            paystackData = { success: false, error: "Missing email or phone number" };
        }
        if (email) {
            paystackData = await paymentController.createVirtualAccount(email, firstname, surname, phoneNumber);
        }

        const customer = await prisma.customer.create({
            data: {
                title, surname, firstname, gender,
                dob: new Date(dob),
                marital_status, home_address, phoneNumber, email,
                nationality, stateOfOrigin, businessName, businessAddress,
                means_of_id, id_number, referrer,
                bankName, accountNumber, bvn,
                nextOfKinName, nextOfKinGender, nextOfKinRelationship,
                nextOfKinPhoneNumber, nextOfKinAddress, profilePicture,
                customers_assets,
                value_of_goods: value_of_goods ? parseFloat(value_of_goods) : null,
                guarantorName, guarantorPhoneNumber, guarantorAddress,
                guarantorBusinessAddress, relationshipWithBorrower,
                guarantorOccupation,
                status: "pending",
                mandateStatus: "NOT_ENROLLED",
                paystackCustomerId: paystackData?.success ? paystackData.paystackCustomerId : null,
                virtualAccountNumber: paystackData?.success ? paystackData.accountNumber : null,
                virtualAccountBank: paystackData?.success ? paystackData.bankName : null,
                branch: { connect: { id: parseInt(branchId) } },
                fieldOfficer: fieldOfficerId ? { connect: { id: parseInt(fieldOfficerId) } } : undefined
            }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Registered Customer",
            details: `Registered ${customer.firstname} ${customer.surname}${paystackData?.success ? ' with virtual account ' + paystackData.accountNumber : ''}`,
            entityType: "Customer",
            entityId: customer.id,
            ipAddress: req.ip
        });

        res.status(201).json({
            ...customer,
            virtualAccount: paystackData?.success ? {
                accountNumber: paystackData.accountNumber,
                bankName: paystackData.bankName,
                bankCode: paystackData.bankCode
            } : null,
            virtualAccountError: paystackData?.success ? null : paystackData?.error
        });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(400).json({ error: error.message });
    }
};

exports.approveCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await prisma.customer.update({
            where: { id: parseInt(id) },
            data: { status: "active" }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Approved Customer",
            details: `Approved customer #${id}`,
            entityType: "Customer",
            entityId: parseInt(id),
            ipAddress: req.ip
        });

        res.json(customer);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.rejectCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await prisma.customer.update({
            where: { id: parseInt(id) },
            data: { status: "rejected" }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Rejected Customer",
            details: `Rejected customer #${id}`,
            entityType: "Customer",
            entityId: parseInt(id),
            ipAddress: req.ip
        });

        res.json(customer);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const updateData = {
            ...data,
            dob: data.dob ? new Date(data.dob) : undefined
        };

        // Relations
        if (data.fieldOfficerId) {
            updateData.fieldOfficer = { connect: { id: parseInt(data.fieldOfficerId) } };
        }
        if (data.branchId) {
            updateData.branch = { connect: { id: parseInt(data.branchId) } };
        }

        // Clean invalid keys
        delete updateData.fieldOfficerId;
        delete updateData.branchId;
        delete updateData.bankCode; // remove field not in schema

        const customer = await prisma.customer.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json(customer);
    } catch (error) {
        console.error("Customer update error:", error);
        res.status(400).json({ error: error.message });
    }
};




exports.deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.customer.update({
            where: { id: parseInt(id) },
            data: { status: "archived" }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Archived Customer",
            details: `Archived customer record #${id}`,
            entityType: "Customer",
            entityId: parseInt(id),
            ipAddress: req.ip
        });

        res.status(200).json({ message: "Customer archived successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getCustomerLoans = async (req, res) => {
    try {
        const { id } = req.params;
        const loans = await prisma.loan.findMany({
            where: { customerId: parseInt(id) },
            include: {
                installment: {
                    orderBy: { expectedDate: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(loans);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getCustomerTransactions = async (req, res) => {
    try {
        const { id } = req.params;
        // Fetch loans for this customer
        const customerLoans = await prisma.loan.findMany({
            where: { customerId: parseInt(id) },
            select: { id: true }
        });
        const loanIds = customerLoans.map(l => l.id);

        const transactions = await prisma.transaction.findMany({
            where: { loanId: { in: loanIds } },
            include: {
                user: {
                    select: { surname: true, othername: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.saveKycDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { bvn, nin } = req.body;

        const customer = await prisma.customer.update({
            where: { id: parseInt(id) },
            data: {
                bvn: bvn || undefined,
                id_number: nin || undefined
            }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Updated Customer KYC",
            details: `Updated BVN/NIN for customer record #${id}`,
            entityType: "Customer",
            entityId: parseInt(id),
            ipAddress: req.ip
        });

        res.json({ success: true, customer });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.regenerateVirtualAccount = async (req, res) => {
    try {
        const { id } = req.params;

        const customer = await prisma.customer.findUnique({
            where: { id: parseInt(id, 10) },
            select: {
                id: true,
                firstname: true,
                surname: true,
                email: true,
                phoneNumber: true,
                status: true
            }
        });

        if (!customer) {
            return res.status(404).json({ error: "Customer not found" });
        }

        if (customer.status === "archived") {
            return res.status(400).json({ error: "Cannot regenerate account for archived customer" });
        }

        if (!customer.email || !customer.phoneNumber) {
            return res.status(400).json({ error: "Customer email and phone number are required to regenerate virtual account" });
        }

        const paymentController = require("./paymentController");
        const paystackData = await paymentController.createVirtualAccount(
            customer.email,
            customer.firstname,
            customer.surname,
            customer.phoneNumber
        );

        if (!paystackData?.success) {
            return res.status(400).json({ error: paystackData?.error || "Failed to regenerate virtual account" });
        }

        const updatedCustomer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
                paystackCustomerId: paystackData.paystackCustomerId || null,
                virtualAccountNumber: paystackData.accountNumber || null,
                virtualAccountBank: paystackData.bankName || null,
                virtualAccountProvider: "paystack"
            }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Regenerated Virtual Account",
            details: `Regenerated virtual account ${paystackData.accountNumber} for customer #${customer.id}`,
            entityType: "Customer",
            entityId: customer.id,
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: "Virtual account regenerated successfully",
            customer: updatedCustomer
        });
    } catch (error) {
        console.error("Virtual account regeneration error:", error);
        res.status(400).json({ error: error.message });
    }
};

exports.regenerateAllVirtualAccounts = async (req, res) => {
    try {
        const paymentController = require("./paymentController");

        const customers = await prisma.customer.findMany({
            where: { status: "active" },
            select: {
                id: true,
                firstname: true,
                surname: true,
                email: true,
                phoneNumber: true
            }
        });

        let successCount = 0;
        let failedCount = 0;
        const failures = [];

        for (const customer of customers) {
            if (!customer.email || !customer.phoneNumber) {
                failedCount += 1;
                failures.push({
                    customerId: customer.id,
                    name: `${customer.firstname} ${customer.surname}`.trim(),
                    error: "Missing email or phone number"
                });
                continue;
            }

            const paystackData = await paymentController.createVirtualAccount(
                customer.email,
                customer.firstname,
                customer.surname,
                customer.phoneNumber
            );

            if (!paystackData?.success) {
                failedCount += 1;
                failures.push({
                    customerId: customer.id,
                    name: `${customer.firstname} ${customer.surname}`.trim(),
                    error: paystackData?.error || "Failed to create virtual account"
                });
                continue;
            }

            await prisma.customer.update({
                where: { id: customer.id },
                data: {
                    paystackCustomerId: paystackData.paystackCustomerId || null,
                    virtualAccountNumber: paystackData.accountNumber || null,
                    virtualAccountBank: paystackData.bankName || null,
                    virtualAccountProvider: "paystack"
                }
            });

            successCount += 1;
        }

        await logActivity({
            userId: req.user?.id || 1,
            action: "Bulk Regenerated Virtual Accounts",
            details: `Regenerated ${successCount} virtual accounts, ${failedCount} failed`,
            entityType: "Customer",
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: "Bulk virtual account regeneration completed",
            total: customers.length,
            successCount,
            failedCount,
            failures: failures.slice(0, 20)
        });
    } catch (error) {
        console.error("Bulk virtual account regeneration error:", error);
        res.status(400).json({ error: error.message });
    }
};

/**
 * Fetch customers with active loans and their next unpaid installment
 */
exports.getCustomersForDirectDebit = async (req, res) => {
    try {
        const { search } = req.query;

        const where = {
            status: "active",
            isDisbursed: true
        };

        if (search) {
            where.OR = [
                !isNaN(Number(search)) ? { id: Number(search) } : undefined,

                {
                    customer: {
                        is: {
                            surname: {
                                contains: search,
                                mode: "insensitive"
                            }
                        }
                    }
                },

                {
                    customer: {
                        is: {
                            firstname: {
                                contains: search,
                                mode: "insensitive"
                            }
                        }
                    }
                }
            ].filter(Boolean);
        }

        const loans = await prisma.loan.findMany({
            where,
            include: {
                customer: {
                    select: {
                        id: true,
                        surname: true,
                        firstname: true,
                        email: true,
                        phoneNumber: true,
                        customer_code: true
                    }
                },
                installment: {
                    where: {
                        status: { not: "paid" }
                    },
                    orderBy: {
                        expectedDate: "asc"
                    },
                    take: 1
                }
            }
        });

        const result = loans
            .map(loan => ({
                id: loan.id,
                customer: loan.customer,
                principal: loan.principal,
                balance: loan.totalToRepay - loan.amountPaid,
                nextInstallment: loan.installment[0] || null
            }))
            .filter(l => l.nextInstallment !== null);

        let activeMandates = [];
        try {
            const mandateRes = await axios.get("https://api.paystack.co/directdebit/mandate-authorizations", {
                params: { status: "active", per_page: 200 },
                headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
            });
            activeMandates = mandateRes.data?.data || [];
        } catch (e) {
            activeMandates = [];
        }

        const activeByEmail = new Set(
            activeMandates
                .map((m) => m?.customer?.email?.toLowerCase())
                .filter(Boolean)
        );
        const activeByCode = new Set(
            activeMandates
                .map((m) => m?.customer?.customer_code)
                .filter(Boolean)
        );

        const hydrated = result.map((row) => {
            const email = row.customer?.email?.toLowerCase();
            const code = row.customer?.customer_code;
            const isMandateActive = (email && activeByEmail.has(email)) || (code && activeByCode.has(code));
            return {
                ...row,
                isMandateActive: !!isMandateActive
            };
        });

        res.json(hydrated);
    } catch (error) {
        console.error("Direct Debit customer fetch error:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.getCustomerSavings = async (req, res) => {
    try {
        const customerId = parseInt(req.params.id, 10);
        if (!customerId) return res.status(400).json({ error: "Invalid customer id" });

        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true, branchId: true }
        });

        if (!customer) return res.status(404).json({ error: "Customer not found" });

        if (req.user.rank >= 3 && req.user.rank <= 4 && customer.branchId !== req.user.branchId) {
            return res.status(403).json({ error: "Not authorized for customer outside your branch." });
        }

        const savingsTransactions = await prisma.transaction.findMany({
            where: {
                source: { in: [SAVINGS_SOURCE.deposit, SAVINGS_SOURCE.withdraw] },
                reference: { contains: `C:${customerId}|` }
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                amount: true,
                source: true,
                createdAt: true,
                reference: true,
                user: { select: { surname: true, othername: true } }
            }
        });

        const rows = savingsTransactions.map((tx) => {
            const noteMatch = String(tx.reference || "").match(/(?:^|\|)N:([^|]*)(?:\||$)/);
            return {
                id: tx.id,
                amount: tx.amount,
                type: tx.source === SAVINGS_SOURCE.withdraw ? "withdraw" : "deposit",
                createdAt: tx.createdAt,
                note: noteMatch ? decodeURIComponent(noteMatch[1]) : "",
                enteredBy: tx.user
            };
        });

        const savingsBalance = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

        res.json({
            customerId,
            savingsBalance,
            transactions: rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

