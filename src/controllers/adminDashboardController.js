const prisma = require("../lib/prisma");
const { logActivity } = require("../lib/logger");

const SAVINGS_SOURCES = ["savings_deposit", "savings_withdrawal"];

exports.getDashboardStats = async (req, res) => {
    try {
        const agentId = req.query.agentId ? parseInt(req.query.agentId) : null;
        const branchFilter = (req.user.rank >= 3 && req.user.rank <= 4) ? { branchId: req.user.branchId } : {};

        const loanWhereActive = {
            ...(agentId ? { fieldOfficerId: agentId } : {}),
            ...branchFilter,
            status: { in: ["active", "approved"] }
        };

        const pendingWhere = {
            ...(agentId ? { fieldOfficerId: agentId } : {}),
            ...branchFilter,
            status: "pending"
        };

        const offlinePendingWhere = {
            ...(agentId ? { agentId } : {}),
            status: "pending",
            ...(branchFilter.branchId ? { loan: { branchId: branchFilter.branchId } } : {})
        };

        const savingsWhere = {
            source: { in: SAVINGS_SOURCES },
            ...(agentId ? { fieldOfficerId: agentId } : {}),
            ...branchFilter
        };

        const now = new Date();
        const overdueLoanWhere = {
            ...loanWhereActive,
            installment: {
                some: {
                    expectedDate: { lt: now },
                    status: { not: "paid" }
                }
            }
        };

        const [totalLoans, activeCustomers, totalRevenue, pendingLoans, pendingOfflinePayments, savingsAggregate, overdueLoanCount] = await Promise.all([
            prisma.loan.aggregate({ _sum: { principal: true }, where: loanWhereActive }),
            prisma.customer.count({ where: { ...(agentId ? { fieldOfficerId: agentId } : {}), ...branchFilter, status: "active" } }),
            agentId
                ? prisma.transaction.aggregate({ _sum: { amount: true }, where: { fieldOfficerId: agentId, ...branchFilter } })
                : prisma.loan.aggregate({ _sum: { amountPaid: true }, where: branchFilter }),
            prisma.loan.count({ where: pendingWhere }),
            prisma.offlinePayment.count({ where: offlinePendingWhere }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: savingsWhere }),
            prisma.loan.count({ where: overdueLoanWhere })
        ]);

        const recentActivity = await prisma.activityLog.findMany({
            where: agentId ? { userId: agentId } : {},
            include: { user: { select: { surname: true, othername: true } } },
            orderBy: { createdAt: "desc" },
            take: 5
        });

        res.json({
            stats: [
                { name: "Total Loans", value: `NGN ${(totalLoans._sum?.principal || 0).toLocaleString()}`, change: "+12.5%", trendingUp: true },
                { name: "Active Customers", value: (activeCustomers || 0).toString(), change: "+3.2%", trendingUp: true },
                { name: "Total Collections", value: `NGN ${(agentId ? (totalRevenue._sum?.amount || 0) : (totalRevenue._sum?.amountPaid || 0)).toLocaleString()}`, change: "+18.4%", trendingUp: true },
                { name: "Savings", value: `NGN ${(savingsAggregate._sum?.amount || 0).toLocaleString()}`, change: "Updated", trendingUp: true },
                { name: "Pending Approvals", value: (pendingLoans || 0).toString(), change: pendingLoans > 5 ? "High" : "Normal", trendingUp: pendingLoans > 5 },
                { name: "Offline Payments Pending", value: (pendingOfflinePayments || 0).toString(), change: pendingOfflinePayments > 5 ? "High" : "Normal", trendingUp: pendingOfflinePayments > 5 },
                { name: "Overdue Loans", value: (overdueLoanCount || 0).toString(), change: overdueLoanCount > 5 ? "Critical" : overdueLoanCount > 0 ? "Needs review" : "Healthy", trendingUp: overdueLoanCount > 0 }
            ],
            recentActivity
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getActivityLogs = async (req, res) => {
    try {
        const logs = await prisma.activityLog.findMany({
            include: {
                user: {
                    select: { surname: true, othername: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
