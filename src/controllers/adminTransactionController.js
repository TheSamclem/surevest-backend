const prisma = require("../lib/prisma");

let txColumnSupportPromise;

// Returns start/end of "today" for WAT (UTC+1) as UTC timestamps.
const getWatDayRangeUtc = (now = new Date()) => {
    const watOffsetMinutes = 60;
    const watNowMs = now.getTime() + watOffsetMinutes * 60 * 1000;
    const watNow = new Date(watNowMs);

    const y = watNow.getUTCFullYear();
    const m = watNow.getUTCMonth();
    const d = watNow.getUTCDate();

    const startMs = Date.UTC(y, m, d, 0, 0, 0, 0) - watOffsetMinutes * 60 * 1000;
    const endMs = startMs + 24 * 60 * 60 * 1000 - 1;

    return { start: new Date(startMs), end: new Date(endMs) };
};

const getTransactionColumnSupport = async () => {
    if (!txColumnSupportPromise) {
        txColumnSupportPromise = prisma.$queryRawUnsafe(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name IN ('Transaction', 'transaction')
        `)
            .then((rows) => {
                const cols = new Set((rows || []).map((r) => r.column_name));
                return {
                    hasSource: cols.has("source"),
                    hasReference: cols.has("reference")
                };
            })
            .catch(() => ({ hasSource: true, hasReference: true }));
    }
    return txColumnSupportPromise;
};

exports.getWebhookTransactions = async (req, res) => {
    try {
        const {
            channel: channelQ = "online",
            branchId: branchQ,
            agentId: agentQ,
            search,
            dateFrom,
            dateTo,
            page: pageQ = "1",
            pageSize: pageSizeQ = "20"
        } = req.query;

        const page = Math.max(1, parseInt(pageQ, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeQ, 10) || 20));
        const skip = (page - 1) * pageSize;

        const branchId = branchQ ? parseInt(branchQ, 10) : null;
        const agentId = agentQ ? parseInt(agentQ, 10) : null;
        const channel = channelQ === "offline" ? "offline" : "online";

        const { hasSource, hasReference } = await getTransactionColumnSupport();

        /* =============================
           BUILD BASE WHERE FILTER
        ============================== */

        const where = {};

        if (hasSource) {
            where.source = channel === "online"
                ? "paystack_webhook"
                : { notIn: ["paystack_webhook", "savings_deposit", "savings_withdrawal"] };
        } else if (hasReference) {
            where.reference = channel === "online"
                ? { not: null }
                : null;
        }

        if (branchId) where.branchId = branchId;
        if (agentId) where.fieldOfficerId = agentId;

        /* =============================
           DATE FILTER (FOR MAIN QUERY)
        ============================== */

        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) where.createdAt.gte = new Date(dateFrom);
            if (dateTo) {
                const dt = new Date(dateTo);
                dt.setHours(23, 59, 59, 999);
                where.createdAt.lte = dt;
            }
        }

        /* =============================
           SEARCH FILTER
        ============================== */

        if (search) {
            const maybeId = Number(search);

            const matchingLoans = await prisma.loan.findMany({
                where: {
                    OR: [
                        { customer: { surname: { contains: search, mode: "insensitive" } } },
                        { customer: { firstname: { contains: search, mode: "insensitive" } } },
                        { branch: { name: { contains: search, mode: "insensitive" } } }
                    ]
                },
                select: { id: true }
            });

            const matchingLoanIds = matchingLoans.map((l) => l.id);

            where.OR = [
                Number.isNaN(maybeId) ? undefined : { id: maybeId },
                Number.isNaN(maybeId) ? undefined : { loanId: maybeId },
                hasReference
                    ? { reference: { contains: search, mode: "insensitive" } }
                    : undefined,
                { user: { surname: { contains: search, mode: "insensitive" } } },
                { user: { othername: { contains: search, mode: "insensitive" } } },
                matchingLoanIds.length
                    ? { loanId: { in: matchingLoanIds } }
                    : undefined
            ].filter(Boolean);
        }

        /* =============================
           SELECT FIELDS
        ============================== */

        const txSelect = {
            id: true,
            loanId: true,
            installmentId: true,
            amount: true,
            fieldOfficerId: true,
            branchId: true,
            createdAt: true,
            updatedAt: true,
            ...(hasSource ? { source: true } : {}),
            ...(hasReference ? { reference: true } : {}),
            user: { select: { id: true, surname: true, othername: true } }
        };

        /* =============================
           FETCH DATA
        ============================== */

        const [total, transactions, aggregate, branches, agents] =
            await Promise.all([
                prisma.transaction.count({ where }),

                prisma.transaction.findMany({
                    where,
                    select: txSelect,
                    orderBy: { createdAt: "desc" },
                    skip,
                    take: pageSize
                }),

                prisma.transaction.aggregate({
                    where,
                    _sum: { amount: true },
                    _count: { _all: true }
                }),

                prisma.branch.findMany({
                    select: { id: true, name: true },
                    orderBy: { name: "asc" }
                }),

                prisma.user.findMany({
                    where: { role: { rank: 2 } },
                    select: { id: true, surname: true, othername: true, branchId: true },
                    orderBy: { surname: "asc" }
                })
            ]);

        /* =============================
           HYDRATE LOANS
        ============================== */

        const loanIdsOnPage = [
            ...new Set(transactions.map((tx) => tx.loanId).filter(Boolean))
        ];

        const loansOnPage = loanIdsOnPage.length
            ? await prisma.loan.findMany({
                  where: { id: { in: loanIdsOnPage } },
                  select: {
                      id: true,
                      customer: {
                          select: { id: true, firstname: true, surname: true }
                      },
                      branch: { select: { id: true, name: true } }
                  }
              })
            : [];

        const loansById = new Map(loansOnPage.map((loan) => [loan.id, loan]));

        const hydratedTransactions = transactions.map((tx) => ({
            ...tx,
            loan: loansById.get(tx.loanId) || null
        }));

        /* =============================
           TODAY SUMMARY (FIXED ✅)
           Ignores dateFrom/dateTo
        ============================== */

        const { createdAt, ...baseWhere } = where;

        const { start: todayStart, end: todayEnd } = getWatDayRangeUtc();

        const todayAgg = await prisma.transaction.aggregate({
            where: {
                ...baseWhere,
                createdAt: {
                    gte: todayStart,
                    lte: todayEnd
                }
            },
            _sum: { amount: true },
            _count: { _all: true }
        });

        /* =============================
           UNIQUE CUSTOMERS ON PAGE
        ============================== */

        const customerIds = new Set(
            hydratedTransactions
                .map((tx) => tx.loan?.customer?.id)
                .filter(Boolean)
        );

        /* =============================
           RESPONSE
        ============================== */

        res.json({
            transactions: hydratedTransactions,
            summary: {
                totalCount: aggregate._count._all || 0,
                totalAmount: aggregate._sum.amount || 0,
                todayCount: todayAgg._count._all || 0,
                todayAmount: todayAgg._sum.amount || 0,
                uniqueCustomersOnPage: customerIds.size
            },
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            },
            filters: {
                branches,
                agents: agents.map((agent) => ({
                    id: agent.id,
                    name: `${agent.surname} ${agent.othername || ""}`.trim(),
                    branchId: agent.branchId
                })),
                schemaWarning: !hasSource
                    ? "Transaction.source column is missing in DB; channel filter fallback is active. Run Prisma migration."
                    : null
            }
        });
    } catch (error) {
        console.error("Error fetching webhook transactions:", error);
        res.status(500).json({ error: error.message });
    }
};
