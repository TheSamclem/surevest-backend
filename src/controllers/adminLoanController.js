const prisma = require("../lib/prisma");
const { logActivity } = require("../lib/logger");

// General Loan Controllers
exports.getLoans = async (req, res) => {
    try {
        const branchFilter = (req.user.rank >= 3 && req.user.rank <= 4) ? { branchId: req.user.branchId } : {};
        const loans = await prisma.loan.findMany({
            where: branchFilter,
            include: {
                customer: { select: { surname: true, firstname: true } },
                loanType: true,
                branch: true,
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

// Get disbursed loans with filters
exports.getDisbursedLoans = async (req, res) => {
    try {
        const { branchId: branchQ, agentId: agentQ, search, dateFrom, dateTo } = req.query;

        const branchId = branchQ ? parseInt(branchQ) : null;
        const agentId = agentQ ? parseInt(agentQ) : null;

        // Build where clause for disbursed loans (isDisbursed = true)
        const where = {
            isDisbursed: true
        };

        if (branchId) where.branchId = branchId;
        if (agentId) where.fieldOfficerId = agentId;

        if (search) {
            where.OR = [
                { id: isNaN(Number(search)) ? undefined : Number(search) },
                { customer: { surname: { contains: search, mode: 'insensitive' } } },
                { customer: { firstname: { contains: search, mode: 'insensitive' } } }
            ].filter(Boolean);
        }

        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                where.createdAt.lte = dt;
            }
        }

        // Fetch disbursed loans with customer, agent, and branch info
        const loans = await prisma.loan.findMany({
            where,
            include: {
                customer: { select: { id: true, surname: true, firstname: true, phoneNumber: true } },
                fieldOfficer: { select: { id: true, surname: true, othername: true } },
                branch: { select: { id: true, name: true } },
                loanType: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Fetch branches and agents for filter dropdowns
        const branches = await prisma.branch.findMany();
        const agents = await prisma.user.findMany({
            where: { role: { rank: 2 } },
            select: { id: true, surname: true, othername: true, branchId: true }
        });

        res.json({
            loans,
            branches,
            agents: agents.map(a => ({ id: a.id, name: `${a.surname} ${a.othername || ''}`.trim(), branchId: a.branchId }))
        });
    } catch (error) {
        console.log("Error fetching disbursed loans:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.getWaitingDisbursalLoans = async (req, res) => {
    try {
        const { branchId: branchQ, agentId: agentQ, search, dateFrom, dateTo } = req.query;

        const branchId = branchQ ? parseInt(branchQ) : null;
        const agentId = agentQ ? parseInt(agentQ) : null;

        // Build where clause for waiting disbursal loans (isDisbursed = false and status = active/approved)
        const where = {
            isDisbursed: false
        };

        if (branchId) where.branchId = branchId;
        if (agentId) where.fieldOfficerId = agentId;

        if (search) {
            where.OR = [
                { id: isNaN(Number(search)) ? undefined : Number(search) },
                { customer: { surname: { contains: search, mode: 'insensitive' } } },
                { customer: { firstname: { contains: search, mode: 'insensitive' } } }
            ].filter(Boolean);
        }

        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                where.createdAt.lte = dt;
            }
        }

        // Fetch waiting disbursal loans with customer, agent, and branch info
        const loans = await prisma.loan.findMany({
            where,
            include: {
                customer: { select: { id: true, surname: true, firstname: true, phoneNumber: true } },
                fieldOfficer: { select: { id: true, surname: true, othername: true } },
                branch: { select: { id: true, name: true } },
                loanType: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Fetch branches and agents for filter dropdowns
        const branches = await prisma.branch.findMany();
        const agents = await prisma.user.findMany({
            where: { role: { rank: 2 } },
            select: { id: true, surname: true, othername: true, branchId: true }
        });

        res.json({
            loans,
            branches,
            agents: agents.map(a => ({ id: a.id, name: `${a.surname} ${a.othername || ''}`.trim(), branchId: a.branchId }))
        });
    } catch (error) {
        console.log("Error fetching waiting disbursal loans:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.createLoan = async (req, res) => {
    try {
        const {
            customerId,
            loanTypeId,
            principal,
            fieldOfficerId,
            branchId
        } = req.body;

        // Verify customer is active
        const customer = await prisma.customer.findUnique({
            where: { id: parseInt(customerId) }
        });
        if (!customer || customer.status !== "active") {
            throw new Error("Cannot create loan: Customer must be approved (active).");
        }

        // Fetch LoanType
        const lType = await prisma.loanType.findUnique({
            where: { id: parseInt(loanTypeId) }
        });
        if (!lType) throw new Error("Invalid Loan Type");
        const interestCollectionMethod = lType.interestCollectionMethod === "ADDED" ? "ADDED" : "DEDUCTED";

        // Fetch required charges
        const charges = await prisma.charge.findMany({
            where: { isRequired: true }
        });

        const principalAmount = parseFloat(principal);

        const computeChargeAmount = (c) =>
            c.type === "PERCENTAGE"
                ? (principalAmount * (c.amount || 0)) / 100
                : (c.amount || 0);

        const deductedSum = charges
            .filter(c => c.collectionMethod === "DEDUCTED")
            .reduce((s, c) => s + computeChargeAmount(c), 0);

        const addedSum = charges
            .filter(c => c.collectionMethod === "ADDED")
            .reduce((s, c) => s + computeChargeAmount(c), 0);

        const interestAmount = (principalAmount * lType.interestRate) / 100;
        const totalCharges = addedSum + deductedSum;
        const prePaidAmount = deductedSum + (interestCollectionMethod === "DEDUCTED" ? interestAmount : 0);
        const disbursedAmount = Math.max(0, principalAmount - prePaidAmount);
        const totalToRepay = principalAmount + totalCharges + interestAmount;

        const loan = await prisma.loan.create({
            data: {
                principal: principalAmount,
                interestRate: lType.interestRate,
                interestCollectionMethod,
                totalToRepay,
                tenure: lType.tenure,
                status: "pending",

                // Pre-paid amounts
                amountPaid: prePaidAmount,
                totalCharges,
                amountDisbursed: disbursedAmount,

                customer: { connect: { id: parseInt(customerId) } },
                loanType: { connect: { id: parseInt(loanTypeId) } },
                fieldOfficer: { connect: { id: parseInt(fieldOfficerId) } },
                branch: { connect: { id: parseInt(branchId) } },

                appliedCharges: {
                    createMany: {
                        data: charges.map(c => ({
                            chargeId: c.id,
                            collectionMethod: c.collectionMethod,
                            amount: computeChargeAmount(c)
                        }))
                    }
                }
            }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Posted Loan Application",
            details: `Applied for ₦${loan.principal.toLocaleString()} loan for customer #${customerId}`,
            entityType: "Loan",
            entityId: loan.id,
            ipAddress: req.ip
        });

        res.status(201).json(loan);

    } catch (error) {
        console.error(error);
        res.status(400).json({ error: error.message });
    }
};


exports.approveLoan = async (req, res) => {
    try {
        const { id } = req.params;
        const { approvedBy, startDate } = req.body;

        const loan = await prisma.loan.findUnique({
            where: { id: parseInt(id) },
            include: { loanType: true }
        });

        if (!loan) throw new Error("Loan not found");
        if (loan.status !== "pending") throw new Error("Loan is not in pending state");

        const holidays = await prisma.holiday.findMany();
        const holidayDates = holidays.map(h => new Date(h.date).toDateString());

        const installments = [];
        let currentDate = new Date(startDate || new Date());
        const interval = loan.loanType.interval; // days between payments
        const totalInstallments = Math.ceil(loan.tenure / interval);
        const installmentAmount = loan.principal / totalInstallments;

        for (let i = 0; i < totalInstallments; i++) {
            // move by interval first
            currentDate.setDate(currentDate.getDate() + interval);

            // then skip weekends & holidays
            while (true) {
                const isHoliday = holidayDates.includes(currentDate.toDateString());
                const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;

                if (!isHoliday && !isWeekend) break;

                // move forward one day until valid
                currentDate.setDate(currentDate.getDate() + 1);
            }

            installments.push({
                loanId: loan.id,
                customerId: loan.customerId,
                fieldOfficerId: loan.fieldOfficerId,
                principal: installmentAmount,
                amountExpected: installmentAmount,
                amountPaid: 0,
                status: "not paid",
                expectedDate: new Date(currentDate)
            });
        }


        const updatedLoan = await prisma.$transaction([
            prisma.loan.update({
                where: { id: parseInt(id) },
                data: {
                    status: "active",
                    approvedStatus: true,
                    approvedBy: parseInt(approvedBy),
                    startDate: new Date(startDate || new Date()),
                    endDate: currentDate
                }
            }),
            prisma.installmentPayment.createMany({
                data: installments
            })
        ]);

        await logActivity({
            userId: req.user?.id || 1,
            action: "Approved Loan",
            details: `Approved loan #${id} with start date ${startDate}`,
            entityType: "Loan",
            entityId: parseInt(id),
            ipAddress: req.ip
        });

        res.json(updatedLoan[0]);
    } catch (error) {
        console.error("Approval Error:", error);
        res.status(400).json({ error: error.message });
    }
};

exports.disburseLoan = async (req, res) => {
    try {
        const { id } = req.params;
        const loan = await prisma.loan.findUnique({
            where: { id: parseInt(id) }
        });

        if (!loan) return res.status(404).json({ error: 'Loan not found' });
        if (loan.status !== 'active') return res.status(400).json({ error: 'Only active loans can be disbursed' });
        if (loan.isDisbursed) return res.status(400).json({ error: 'Loan is already disbursed' });

        const updatedLoan = await prisma.loan.update({
            where: { id: parseInt(id) },
            data: { isDisbursed: true, updatedAt: new Date() },
            include: {
                customer: { select: { surname: true, firstname: true } },
                loanType: true,
                branch: true
            }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Disbursed Loan",
            details: `Disbursed ₦${updatedLoan.amountDisbursed.toLocaleString()} for loan #${id}`,
            entityType: "Loan",
            entityId: parseInt(id),
            ipAddress: req.ip
        });

        res.json(updatedLoan);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.rejectLoan = async (req, res) => {
    try {
        const { id } = req.params;
        const loan = await prisma.loan.update({
            where: { id: parseInt(id) },
            data: { status: "rejected" }
        });

        await logActivity({
            userId: req.user?.id || 1,
            action: "Rejected Loan Application",
            details: `Rejected loan application #${id}`,
            entityType: "Loan",
            entityId: parseInt(id),
            ipAddress: req.ip
        });

        res.json(loan);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Installment Controllers
exports.getInstallmentsAssigned = async (req, res) => {
    try {
        const agentIdQuery = req.query.agentId ? parseInt(req.query.agentId) : null;
        const agentId = agentIdQuery || req.user?.id || null;
        const where = agentId ? { fieldOfficerId: parseInt(agentId) } : {};

        const installments = await prisma.installmentPayment.findMany({
            where: {
                ...where,
                status: { not: 'paid' }
            },
            include: {
                loan: {
                    include: {
                        customer: true
                    }
                }
            },
            orderBy: { expectedDate: 'asc' }
        });

        const installmentIds = installments.map((it) => it.id);
        const txRows = installmentIds.length
            ? await prisma.transaction.findMany({
                where: { installmentId: { in: installmentIds } },
                select: { installmentId: true, createdAt: true },
                orderBy: { createdAt: 'desc' }
            })
            : [];

        const latestTxByInstallmentId = new Map();
        for (const tx of txRows) {
            if (!latestTxByInstallmentId.has(tx.installmentId)) {
                latestTxByInstallmentId.set(tx.installmentId, tx.createdAt);
            }
        }

        const withCollectionDate = installments.map((it) => ({
            ...it,
            lastTransactionDate: latestTxByInstallmentId.get(it.id) || null
        }));

        res.json(withCollectionDate);
    } catch (error) {
        console.error("Installment Error:", error);
        res.status(500).json({ error: error.message });
    }
};

// Get expired loans with filters (past endDate and not fully paid)
exports.getExpiredLoans = async (req, res) => {
    try {
        const { branchId: branchQ, agentId: agentQ, search, dateFrom, dateTo } = req.query;

        const branchId = branchQ ? parseInt(branchQ) : null;
        const agentId = agentQ ? parseInt(agentQ) : null;

        const where = {
            endDate: { lt: new Date() }
        };

        if (branchId) where.branchId = branchId;
        if (agentId) where.fieldOfficerId = agentId;

        if (search) {
            where.OR = [
                { id: isNaN(Number(search)) ? undefined : Number(search) },
                { customer: { surname: { contains: search, mode: 'insensitive' } } },
                { customer: { firstname: { contains: search, mode: 'insensitive' } } }
            ].filter(Boolean);
        }

        // Apply date filters on loan period end date for expired list
        if (dateFrom || dateTo) {
            where.endDate = {};
            if (dateFrom) where.endDate.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                where.endDate.lte = dt;
            }
        }

        const loans = await prisma.loan.findMany({
            where,
            include: {
                customer: { select: { id: true, surname: true, firstname: true, phoneNumber: true } },
                fieldOfficer: { select: { id: true, surname: true, othername: true } },
                branch: { select: { id: true, name: true } },
                loanType: { select: { id: true, name: true, interestRate: true } }
            },
            orderBy: { endDate: 'asc' }
        });

        const expiredLoans = loans.filter(
            (loan) => Number(loan.amountPaid || 0) < Number(loan.totalToRepay || 0)
        );

        const branches = await prisma.branch.findMany();
        const agents = await prisma.user.findMany({
            where: { role: { rank: 2 } },
            select: { id: true, surname: true, othername: true, branchId: true }
        });

        res.json({
            loans: expiredLoans,
            branches,
            agents: agents.map(a => ({ id: a.id, name: `${a.surname} ${a.othername || ''}`.trim(), branchId: a.branchId }))
        });
    } catch (error) {
        console.log("Error fetching expired loans:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.getInstallment = async (req, res) => {
    try {
        const { id } = req.params;
        const installment = await prisma.installmentPayment.findUnique({
            where: { id: parseInt(id) },
            include: {
                loan: { include: { customer: true } },
                customer: true
            }
        });
        if (!installment) return res.status(404).json({ error: 'Installment not found' });
        res.json(installment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.collectInstallment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount: rawAmount, agentId: bodyAgentId } = req.body;
        const agentId = parseInt(bodyAgentId) || req.user?.id;
        if (!agentId) return res.status(400).json({ error: 'agentId required' });

        const installment = await prisma.installmentPayment.findUnique({
            where: { id: parseInt(id) },
            include: { loan: true }
        });
        if (!installment) return res.status(404).json({ error: 'Installment not found' });

        if (installment.fieldOfficerId !== agentId) {
            const admin = await prisma.user.findUnique({ where: { id: parseInt(agentId) }, include: { role: true } });
            if (!admin || admin.role.rank < 5) {
                return res.status(403).json({ error: 'Not authorized to collect this installment' });
            }
        }

        const amount = parseFloat(rawAmount);
        if (!amount || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const remaining = Math.max(0, installment.amountExpected - installment.amountPaid);
        const toPay = Math.min(amount, remaining);
        if (toPay <= 0) return res.status(400).json({ error: 'Nothing to collect' });

        const newAmountPaid = installment.amountPaid + toPay;
        const newStatus = newAmountPaid >= installment.amountExpected ? 'paid' : 'partially paid';

        const updates = [
            prisma.installmentPayment.update({
                where: { id: parseInt(id) },
                data: { amountPaid: { increment: toPay }, status: newStatus }
            }),
            prisma.transaction.create({
                data: {
                    loanId: installment.loanId,
                    installmentId: installment.id,
                    amount: toPay,
                    fieldOfficerId: agentId,
                    branchId: installment.loan.branchId,
                    source: "manual_collection"
                }
            }),
            prisma.loan.update({
                where: { id: installment.loanId },
                data: {
                    amountPaid: { increment: toPay },
                    status: (installment.loan.amountPaid + toPay >= installment.loan.totalToRepay) ? 'completed' : 'active'
                }
            })
        ];

        await prisma.$transaction(updates);

        await logActivity({
            userId: agentId,
            action: "Collected Installment",
            details: `Collected ₦${toPay} for installment #${id}`,
            entityType: "InstallmentPayment",
            entityId: parseInt(id),
            ipAddress: req.ip
        });

        const updated = await prisma.installmentPayment.findUnique({
            where: { id: parseInt(id) },
            include: { loan: { include: { customer: true } }, customer: true }
        });

        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getOverdueInstallments = async (req, res) => {
    try {
        const { branchId: branchQ, agentId: agentQ, dateFrom, dateTo, search } = req.query;
        const branchId = branchQ ? parseInt(branchQ) : null;
        const agentId = agentQ ? parseInt(agentQ) : null;

        const where = {};
        const now = new Date();
        where.expectedDate = { lt: now };

        if (dateFrom || dateTo) {
            where.expectedDate = {};
            if (dateFrom) where.expectedDate.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                where.expectedDate.lte = dt;
            }
        }

        if (agentId) where.fieldOfficerId = agentId;

        if (search) {
            where.OR = [
                { id: isNaN(Number(search)) ? undefined : Number(search) },
                { loan: { customer: { surname: { contains: search, mode: 'insensitive' } } } },
                { loan: { customer: { firstname: { contains: search, mode: 'insensitive' } } } }
            ].filter(Boolean);
        }

        const installments = await prisma.installmentPayment.findMany({
            where,
            include: { loan: { include: { branch: true, customer: true, fieldOfficer: true } } },
            orderBy: { expectedDate: 'asc' }
        });

        const unpaid = installments.filter(it => Number(it.amountPaid || 0) < Number(it.amountExpected || 0));
        const filtered = branchId ? unpaid.filter(it => (it.loan?.branchId || null) === branchId) : unpaid;

        let totalExpected = 0, totalCollected = 0, totalDue = 0, totalOverdue = 0;
        for (const it of filtered) {
            const expected = Number(it.amountExpected || 0);
            const paid = Number(it.amountPaid || 0);
            const due = expected - paid;
            totalExpected += expected;
            totalCollected += paid;
            totalDue += due;
            if (it.expectedDate && new Date(it.expectedDate) < now && due > 0) totalOverdue += due;
        }

        const branches = await prisma.branch.findMany();
        const agents = await prisma.user.findMany({
            where: { role: { rank: 2 } },
            select: { id: true, surname: true, othername: true, branchId: true }
        });

        res.json({
            installments: filtered,
            totals: { count: filtered.length, totalExpected, totalCollected, totalDue, totalOverdue },
            branches,
            agents: agents.map(a => ({ id: a.id, name: `${a.surname} ${a.othername || ''}`.trim(), branchId: a.branchId }))
        });
    } catch (error) {
        console.error('Error fetching overdue installments:', error);
        res.status(500).json({ error: error.message });
    }
};
