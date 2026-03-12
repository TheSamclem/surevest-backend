const prisma = require("../lib/prisma");
const { logActivity } = require("../lib/logger");

const SAVINGS_SOURCE = {
    deposit: "savings_deposit",
    withdraw: "savings_withdrawal"
};

const CUSTOMER_REF_REGEX = /(?:^|\|)C:(\d+)(?:\||$)/;
const NOTE_REF_REGEX = /(?:^|\|)N:([^|]*)(?:\||$)/;

const parseReferenceMeta = (reference = "") => {
    const customerMatch = reference.match(CUSTOMER_REF_REGEX);
    const noteMatch = reference.match(NOTE_REF_REGEX);

    return {
        customerId: customerMatch ? Number(customerMatch[1]) : null,
        note: noteMatch ? decodeURIComponent(noteMatch[1]) : ""
    };
};

const buildReference = ({ customerId, note }) => {
    const cleanNote = String(note || "").trim();
    const encoded = encodeURIComponent(cleanNote).slice(0, 180);
    return `C:${customerId}|N:${encoded}|R:${Date.now()}`;
};

exports.getSavingsTransactions = async (req, res) => {
    try {
        const { type = "all", page: pageQ = "1", pageSize: pageSizeQ = "20" } = req.query;

        const page = Math.max(1, parseInt(pageQ, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeQ, 10) || 20));
        const skip = (page - 1) * pageSize;

        const branchScoped = req.user.rank >= 3 && req.user.rank <= 4;

        const where = {
            source: type === "deposit"
                ? SAVINGS_SOURCE.deposit
                : type === "withdraw"
                    ? SAVINGS_SOURCE.withdraw
                    : { in: [SAVINGS_SOURCE.deposit, SAVINGS_SOURCE.withdraw] },
            ...(branchScoped ? { branchId: req.user.branchId } : {})
        };

        const [total, transactions] = await Promise.all([
            prisma.transaction.count({ where }),
            prisma.transaction.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: pageSize,
                select: {
                    id: true,
                    amount: true,
                    source: true,
                    reference: true,
                    createdAt: true,
                    user: {
                        select: { id: true, surname: true, othername: true }
                    }
                }
            })
        ]);

        const customerIds = [
            ...new Set(
                transactions
                    .map((tx) => parseReferenceMeta(tx.reference).customerId)
                    .filter(Boolean)
            )
        ];

        const customers = customerIds.length
            ? await prisma.customer.findMany({
                where: { id: { in: customerIds } },
                select: { id: true, firstname: true, surname: true, phoneNumber: true }
            })
            : [];

        const customerById = new Map(customers.map((c) => [c.id, c]));

        const rows = transactions.map((tx) => {
            const meta = parseReferenceMeta(tx.reference);
            return {
                id: tx.id,
                amount: tx.amount,
                type: tx.source === SAVINGS_SOURCE.withdraw ? "withdraw" : "deposit",
                createdAt: tx.createdAt,
                note: meta.note,
                customer: meta.customerId ? customerById.get(meta.customerId) || null : null,
                enteredBy: tx.user
            };
        });

        res.json({
            rows,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.max(1, Math.ceil(total / pageSize))
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createSavingsEntry = async ({ req, res, source }) => {
    try {
        const { customerId, amount, note } = req.body || {};
        const parsedCustomerId = Number(customerId);
        const parsedAmount = Number(amount);

        if (!parsedCustomerId || Number.isNaN(parsedCustomerId)) {
            return res.status(400).json({ error: "Valid customerId is required." });
        }
        if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ error: "Amount must be greater than 0." });
        }

        const customer = await prisma.customer.findUnique({
            where: { id: parsedCustomerId },
            select: { id: true, branchId: true, firstname: true, surname: true }
        });

        if (!customer) return res.status(404).json({ error: "Customer not found." });

        if (req.user.rank >= 3 && req.user.rank <= 4 && customer.branchId !== req.user.branchId) {
            return res.status(403).json({ error: "Not authorized for customer outside your branch." });
        }

        const tx = await prisma.transaction.create({
            data: {
                loanId: 0,
                installmentId: 0,
                amount: source === SAVINGS_SOURCE.withdraw ? -Math.abs(parsedAmount) : Math.abs(parsedAmount),
                source,
                reference: buildReference({ customerId: parsedCustomerId, note }),
                fieldOfficerId: req.user.id,
                branchId: customer.branchId
            }
        });

        await logActivity({
            userId: req.user.id,
            action: source === SAVINGS_SOURCE.withdraw ? "Savings Withdrawal" : "Savings Deposit",
            details: `${customer.firstname} ${customer.surname} - ${parsedAmount}`,
            entityType: "Transaction",
            entityId: tx.id,
            ipAddress: req.ip
        });

        res.status(201).json(tx);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createSavingsDeposit = async (req, res) =>
    createSavingsEntry({ req, res, source: SAVINGS_SOURCE.deposit });

exports.createSavingsWithdrawal = async (req, res) =>
    createSavingsEntry({ req, res, source: SAVINGS_SOURCE.withdraw });
