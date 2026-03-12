const prisma = require("../lib/prisma");

const EXCLUDED_PROFIT_LOSS_SOURCES = ["savings_deposit", "savings_withdrawal"];

exports.getAgentReports = async (req, res) => {
    try {
        const { agentId: agentQ, dateFrom, dateTo } = req.query;
        const agentId = agentQ ? parseInt(agentQ) : null;

        const where = {};
        if (agentId) where.fieldOfficerId = agentId;
        if (dateFrom || dateTo) {
            where.expectedDate = {};
            if (dateFrom) where.expectedDate.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                where.expectedDate.lte = dt;
            }
        }

        const installments = await prisma.installmentPayment.findMany({
            where,
            include: { loan: { select: { branchId: true } } },
            orderBy: { expectedDate: 'asc' }
        });

        const agentsRaw = await prisma.user.findMany({
            where: { role: { rank: 2 } },
            select: { id: true, surname: true, othername: true }
        });
        const agents = agentsRaw.map(a => ({ id: a.id, name: `${a.surname} ${a.othername || ''}`.trim() }));

        const map = new Map();
        const now = new Date();
        for (const it of installments) {
            const key = it.fieldOfficerId || 0;
            if (!map.has(key)) map.set(key, { agentId: key, name: '', totalExpected: 0, totalCollected: 0, totalDue: 0, totalOverdue: 0 });
            const row = map.get(key);
            const expected = Number(it.amountExpected || 0);
            const paid = Number(it.amountPaid || 0);
            const due = expected - paid;
            row.totalExpected += expected;
            row.totalCollected += paid;
            row.totalDue += due;
            if (it.expectedDate && new Date(it.expectedDate) < now && due > 0) {
                row.totalOverdue += due;
            }
        }

        const rows = Array.from(map.values()).map(r => {
            const a = agents.find(x => x.id === r.agentId);
            return { ...r, name: a ? `${a.surname} ${a.othername || ''}`.trim() : (r.agentId === 0 ? 'Unassigned' : '—') };
        });

        res.json({ rows, agents });
    } catch (error) {
        console.error('Error fetching agent reports:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getBranchReports = async (req, res) => {
    try {
        const { branchId: branchQ, dateFrom, dateTo } = req.query;
        const branchId = branchQ ? parseInt(branchQ) : null;

        const where = {};
        if (dateFrom || dateTo) {
            where.expectedDate = {};
            if (dateFrom) where.expectedDate.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                where.expectedDate.lte = dt;
            }
        }

        const installments = await prisma.installmentPayment.findMany({
            where,
            include: { loan: { select: { branchId: true } } },
            orderBy: { expectedDate: 'asc' }
        });

        const branches = await prisma.branch.findMany();

        const map = new Map();
        const now = new Date();
        for (const it of installments) {
            const bId = it.loan?.branchId || 0;
            if (branchId && bId !== branchId) continue;
            if (!map.has(bId)) map.set(bId, { branchId: bId, name: '', totalExpected: 0, totalCollected: 0, totalDue: 0, totalOverdue: 0 });
            const row = map.get(bId);
            const expected = Number(it.amountExpected || 0);
            const paid = Number(it.amountPaid || 0);
            const due = expected - paid;
            row.totalExpected += expected;
            row.totalCollected += paid;
            row.totalDue += due;
            if (it.expectedDate && new Date(it.expectedDate) < now && due > 0) {
                row.totalOverdue += due;
            }
        }

        const rows = Array.from(map.values()).map(r => {
            const b = branches.find(x => x.id === r.branchId);
            return { ...r, name: b ? b.name : (r.branchId === 0 ? 'Unassigned' : '—') };
        });

        res.json({ rows, branches });
    } catch (error) {
        console.error('Error fetching branch reports:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getIncomeReport = async (req, res) => {
    try {
        const { branchId: branchQ, agentId: agentQ, dateFrom, dateTo, search } = req.query;
        const branchId = branchQ ? parseInt(branchQ) : null;
        const agentId = agentQ ? parseInt(agentQ) : null;

        const createdWhere = {};
        if (dateFrom || dateTo) {
            createdWhere.createdAt = {};
            if (dateFrom) createdWhere.createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                createdWhere.createdAt.lte = dt;
            }
        }

        const paymentWhere = {};
        if (createdWhere.createdAt) paymentWhere.createdAt = createdWhere.createdAt;
        if (branchId) paymentWhere.branchId = branchId;
        if (agentId) paymentWhere.fieldOfficerId = agentId;
        if (search) {
            const maybeId = Number(search);
            const matchingLoans = await prisma.loan.findMany({
                where: {
                    OR: [
                        { customer: { surname: { contains: search, mode: 'insensitive' } } },
                        { customer: { firstname: { contains: search, mode: 'insensitive' } } }
                    ]
                },
                select: { id: true }
            });
            const matchingLoanIds = matchingLoans.map((l) => l.id);
            paymentWhere.OR = [
                isNaN(maybeId) ? undefined : { id: maybeId },
                isNaN(maybeId) ? undefined : { loanId: maybeId },
                matchingLoanIds.length ? { loanId: { in: matchingLoanIds } } : undefined
            ].filter(Boolean);
        }

        const payments = await prisma.transaction.findMany({
            where: paymentWhere,
            orderBy: { createdAt: 'desc' }
        });

        const paymentLoanIds = [...new Set(payments.map((p) => p.loanId).filter(Boolean))];
        const paymentLoans = paymentLoanIds.length
            ? await prisma.loan.findMany({
                where: { id: { in: paymentLoanIds } },
                include: {
                    customer: { select: { id: true, surname: true, firstname: true } },
                    fieldOfficer: { select: { id: true, surname: true, othername: true } },
                    branch: true
                }
            })
            : [];
        const paymentLoanById = new Map(paymentLoans.map((l) => [l.id, l]));

        const loanWhere = { ...createdWhere };
        if (branchId) loanWhere.branchId = branchId;
        if (agentId) loanWhere.fieldOfficerId = agentId;
        if (search) {
            loanWhere.OR = [
                { id: isNaN(Number(search)) ? undefined : Number(search) },
                { customer: { surname: { contains: search, mode: 'insensitive' } } },
                { customer: { firstname: { contains: search, mode: 'insensitive' } } }
            ].filter(Boolean);
        }

        const loans = await prisma.loan.findMany({
            where: loanWhere,
            include: { customer: { select: { id: true, surname: true, firstname: true } }, fieldOfficer: { select: { id: true, surname: true, othername: true } }, branch: true, loanType: true }
        });

        const rows = [];
        let paymentsTotal = 0;
        let interestTotal = 0;
        let chargesTotal = 0;

        for (const p of payments) {
            const relatedLoan = paymentLoanById.get(p.loanId);
            const amount = Number(p.amount || 0);
            paymentsTotal += amount;

            rows.push({
                id: p.id,
                type: 'payment',
                date: p.createdAt,
                customer: relatedLoan?.customer ? `${relatedLoan.customer.surname} ${relatedLoan.customer.firstname || ''}`.trim() : '—',
                agent: relatedLoan?.fieldOfficer ? `${relatedLoan.fieldOfficer.surname} ${relatedLoan.fieldOfficer.othername || ''}`.trim() : '—',
                branch: relatedLoan?.branch ? relatedLoan.branch.name : '—',
                amount: amount
            });
        }

        for (const L of loans) {
            const principal = Number(L.principal || 0);
            const rate = Number(L.interestRate || L.loanType?.interestRate || 0);
            const interest = (principal * rate) / 100;
            const charges = Number(L.totalCharges || 0);
            interestTotal += interest;
            chargesTotal += charges;

            rows.push({
                id: L.id,
                type: 'loan',
                date: L.createdAt,
                customer: L.customer ? `${L.customer.surname} ${L.customer.firstname || ''}`.trim() : '—',
                agent: L.fieldOfficer ? `${L.fieldOfficer.surname} ${L.fieldOfficer.othername || ''}`.trim() : '—',
                branch: L.branch ? L.branch.name : '—',
                interestCharged: interest,
                charges: charges
            });
        }

        const branches = await prisma.branch.findMany();
        const agents = await prisma.user.findMany({
            where: { role: { rank: 2 } },
            select: { id: true, surname: true, othername: true, branchId: true }
        });

        res.json({
            rows,
            totals: { paymentsTotal, interestTotal, chargesTotal, totalIncome: paymentsTotal + interestTotal + chargesTotal },
            branches,
            agents: agents.map(a => ({ id: a.id, name: `${a.surname} ${a.othername || ''}`.trim(), branchId: a.branchId }))
        });
    } catch (error) {
        console.error('Error fetching income report:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getProfitLoss = async (req, res) => {
    try {
        const { branchId: branchQ, type: typeQ = 'all', dateFrom, dateTo, search } = req.query;
        const branchId = branchQ ? parseInt(branchQ) : null;
        const type = ['all', 'income', 'expense'].includes(String(typeQ)) ? String(typeQ) : 'all';

        const txWhere = {};
        if (branchId) txWhere.branchId = branchId;
        txWhere.source = { notIn: EXCLUDED_PROFIT_LOSS_SOURCES };
        if (dateFrom || dateTo) {
            txWhere.createdAt = {};
            if (dateFrom) txWhere.createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                txWhere.createdAt.lte = dt;
            }
        }
        if (search) {
            const maybeId = Number(search);
            txWhere.OR = [
                isNaN(maybeId) ? undefined : { id: maybeId },
                { source: { contains: search, mode: 'insensitive' } },
                { reference: { contains: search, mode: 'insensitive' } }
            ].filter(Boolean);
        }

        const transactions = await prisma.transaction.findMany({
            where: txWhere,
            orderBy: { createdAt: 'desc' }
        });

        const txLoanIds = [...new Set(transactions.map((tx) => tx.loanId).filter(Boolean))];
        const txLoans = txLoanIds.length
            ? await prisma.loan.findMany({
                where: { id: { in: txLoanIds } },
                include: {
                    customer: { select: { id: true, surname: true, firstname: true } },
                    fieldOfficer: { select: { id: true, surname: true, othername: true } },
                    branch: { select: { id: true, name: true } }
                }
            })
            : [];
        const txLoanById = new Map(txLoans.map((l) => [l.id, l]));

        const classifyTransactionType = (tx) => {
            const amount = Number(tx.amount || 0);
            const source = String(tx.source || '').toLowerCase();
            if (amount < 0) return 'expense';
            if (
                source.includes('expense') ||
                source.includes('withdraw') ||
                source.includes('disburse') ||
                source.includes('debit') ||
                source.includes('refund') ||
                source.includes('reversal')
            ) return 'expense';
            return 'income';
        };

        const txRows = transactions.map((tx) => {
            const loan = txLoanById.get(tx.loanId);
            return {
                id: `tx-${tx.id}`,
                date: tx.createdAt,
                type: classifyTransactionType(tx),
                source: 'Transaction',
                description: tx.source || 'manual_collection',
                amount: Math.abs(Number(tx.amount || 0)),
                loanId: tx.loanId || null,
                customer: loan?.customer ? `${loan.customer.surname} ${loan.customer.firstname || ''}`.trim() : '—',
                agent: loan?.fieldOfficer ? `${loan.fieldOfficer.surname} ${loan.fieldOfficer.othername || ''}`.trim() : '—',
                branch: loan?.branch?.name || '—'
            };
        });

        const loanWhere = { endDate: { lt: new Date() } };
        if (branchId) loanWhere.branchId = branchId;
        if (dateFrom || dateTo) {
            loanWhere.endDate = {};
            if (dateFrom) loanWhere.endDate.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                loanWhere.endDate.lte = dt;
            }
        }
        if (search) {
            loanWhere.OR = [
                { customer: { surname: { contains: search, mode: 'insensitive' } } },
                { customer: { firstname: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const endedLoans = await prisma.loan.findMany({
            where: loanWhere,
            include: {
                customer: { select: { id: true, surname: true, firstname: true } },
                fieldOfficer: { select: { id: true, surname: true, othername: true } },
                branch: { select: { id: true, name: true } },
                loanType: { select: { interestRate: true } }
            },
            orderBy: { endDate: 'desc' }
        });

        const endedLoanIncomeRows = endedLoans
            .map((loan) => {
                const principal = Number(loan.principal || 0);
                const rate = Number(loan.interestRate || loan.loanType?.interestRate || 0);
                const interest = (principal * rate) / 100;
                const charges = Number(loan.totalCharges || 0);
                const amount = interest + charges;
                if (amount <= 0) return null;

                return {
                    id: `ended-loan-${loan.id}`,
                    date: loan.endDate || loan.updatedAt || loan.createdAt,
                    type: 'income',
                    source: 'Loan Ended',
                    description: `Interest + charges on ended loan #${loan.id}`,
                    amount,
                    loanId: loan.id,
                    customer: loan.customer ? `${loan.customer.surname} ${loan.customer.firstname || ''}`.trim() : '—',
                    agent: loan.fieldOfficer ? `${loan.fieldOfficer.surname} ${loan.fieldOfficer.othername || ''}`.trim() : '—',
                    branch: loan.branch?.name || '—'
                };
            })
            .filter(Boolean);

        let rows = [...txRows, ...endedLoanIncomeRows];
        if (type !== 'all') rows = rows.filter((r) => r.type === type);
        rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const incomeTotal = rows
            .filter((r) => r.type === 'income')
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);
        const expenseTotal = rows
            .filter((r) => r.type === 'expense')
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);

        const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });

        res.json({
            rows,
            totals: {
                incomeTotal,
                expenseTotal,
                netProfitLoss: incomeTotal - expenseTotal
            },
            branches
        });
    } catch (error) {
        console.error('Error fetching profit/loss report:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.createProfitLossEntry = async (req, res) => {
    try {
        const { type, amount, description, branchId: branchQ } = req.body;

        if (!['income', 'expense'].includes(String(type))) {
            return res.status(400).json({ error: 'type must be income or expense' });
        }

        const numericAmount = Number(amount);
        if (!numericAmount || Number.isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ error: 'amount must be greater than 0' });
        }

        const parsedBranchId = branchQ ? parseInt(branchQ, 10) : req.user?.branchId;
        if (!parsedBranchId || Number.isNaN(parsedBranchId)) {
            return res.status(400).json({ error: 'branchId is required' });
        }

        const signedAmount = type === 'expense' ? -Math.abs(numericAmount) : Math.abs(numericAmount);

        const entry = await prisma.transaction.create({
            data: {
                loanId: 0,
                installmentId: 0,
                amount: signedAmount,
                fieldOfficerId: req.user?.id || 1,
                branchId: parsedBranchId,
                source: `manual_${type}`,
                reference: description ? String(description).trim() : null
            }
        });

        res.status(201).json(entry);
    } catch (error) {
        console.error('Error creating profit/loss entry:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getReports = async (req, res) => {
    try {
        const {
            branchId: branchQ,
            agentId: agentQ,
            status: statusQ,
            dateFrom,
            dateTo,
            search,
            page = 1,
            pageSize = 10
        } = req.query;

        const branchId = branchQ ? parseInt(branchQ) : null;
        const agentId = agentQ ? parseInt(agentQ) : null;
        const pageNum = parseInt(page) || 1;
        const limit = parseInt(pageSize) || 10;

        const where = {};
        if (branchId) where.branchId = branchId;
        if (agentId) where.fieldOfficerId = agentId;
        if (statusQ && ['pending', 'approved', 'rejected', 'active', 'completed'].includes(String(statusQ))) where.status = String(statusQ);
        if (search) {
            where.OR = [
                { id: isNaN(Number(search)) ? undefined : Number(search) },
                { customer: { surname: { contains: search, mode: 'insensitive' } } }
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

        const now = new Date();
        const [totalApplications, approved, rejected, pending, expiredLoanCandidates, totalAmountRaw] = await Promise.all([
            prisma.loan.count({ where }),
            prisma.loan.count({ where: { ...where, status: 'approved' } }),
            prisma.loan.count({ where: { ...where, status: 'rejected' } }),
            prisma.loan.count({ where: { ...where, status: 'pending' } }),
            prisma.loan.findMany({
                where: {
                    ...where,
                    endDate: { lt: now }
                },
                select: { amountPaid: true, totalToRepay: true }
            }),
            prisma.loan.aggregate({ _sum: { principal: true }, where })
        ]);
        const expiredLoans = expiredLoanCandidates.filter(
            (loan) => Number(loan.amountPaid || 0) < Number(loan.totalToRepay || 0)
        ).length;

        const totalAmount = totalAmountRaw._sum?.principal || 0;

        const daysAgo = 6;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);
        const recentLoans = await prisma.loan.findMany({
            where: { ...where, createdAt: { gte: startDate } },
            select: { id: true, createdAt: true }
        });

        const chartData = [];
        for (let d = daysAgo; d >= 0; d--) {
            const dt = new Date();
            dt.setDate(dt.getDate() - d);
            const label = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const count = recentLoans.filter(r => {
                const rd = new Date(r.createdAt);
                return rd.getFullYear() === dt.getFullYear() && rd.getMonth() === dt.getMonth() && rd.getDate() === dt.getDate();
            }).length;
            chartData.push({ label, count });
        }

        const [applications, total] = await Promise.all([
            prisma.loan.findMany({
                where,
                include: {
                    customer: { select: { id: true, surname: true, firstname: true, phoneNumber: true } },
                    branch: { select: { id: true, name: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limit,
                take: limit
            }),
            prisma.loan.count({ where })
        ]);

        const [branches, users] = await Promise.all([
            prisma.branch.findMany({ orderBy: { name: 'asc' } }),
            prisma.user.findMany({
                where: { role: { rank: 2 } },
                select: { id: true, surname: true, othername: true, branchId: true }
            })
        ]);

        const totalPages = Math.max(1, Math.ceil(total / limit));

        res.json({
            kpis: {
                totalApplications,
                approved,
                rejected,
                pending,
                expiredLoans,
                totalAmount
            },
            chartData,
            applications: applications.map(a => {
                const agentUser = users.find(u => u.id === (a.fieldOfficerId || a.fieldOfficerId === 0 ? a.fieldOfficerId : null));
                return {
                    id: a.id,
                    customer: a.customer ? { id: a.customer.id, surname: a.customer.surname, firstname: a.customer.firstname, phoneNumber: a.customer.phoneNumber } : null,
                    agent: agentUser ? { id: agentUser.id, name: `${agentUser.surname} ${agentUser.othername || ''}`.trim() } : null,
                    branch: a.branch ? { id: a.branch.id, name: a.branch.name } : null,
                    amount: a.principal,
                    status: a.status,
                    date: a.createdAt
                };
            }),
            total,
            totalPages,
            branches,
            agents: users.map(u => ({ id: u.id, name: `${u.surname} ${u.othername || ''}`.trim(), branchId: u.branchId }))
        });
    } catch (error) {
        console.error('Reports error', error);
        res.status(500).json({ error: error.message });
    }
};
