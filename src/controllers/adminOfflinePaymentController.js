const prisma = require("../lib/prisma");
const { logActivity } = require("../lib/logger");

exports.getOfflinePayments = async (req, res) => {
    try {
        const payments = await prisma.offlinePayment.findMany({
            include: {
                customer: { select: { surname: true, firstname: true } },
                agent: { select: { surname: true, othername: true } },
                loan: { select: { id: true, principal: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getOfflinePaymentsAssigned = async (req, res) => {
    try {
        const agentIdQuery = req.query.agentId ? parseInt(req.query.agentId) : null;
        const agentId = agentIdQuery || req.user?.id || null;

        const where = agentId ? { agentId: parseInt(agentId) } : {};

        const payments = await prisma.offlinePayment.findMany({
            where,
            include: {
                customer: { select: { id: true, surname: true, firstname: true } },
                agent: { select: { id: true, surname: true, othername: true } },
                loan: { select: { id: true, principal: true, branchId: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getOfflinePayment = async (req, res) => {
    try {
        const { id } = req.params;

        const payment = await prisma.offlinePayment.findUnique({
            where: { id: parseInt(id) },
            include: {
                customer: true,
                loan: true,
                agent: {
                    select: {
                        id: true,
                        surname: true,
                        othername: true,
                        email: true
                    }
                },
                admin: {
                    select: {
                        id: true,
                        surname: true,
                        othername: true
                    }
                }
            }
        });

        if (!payment) {
            return res.status(404).json({ error: "Offline payment not found" });
        }

        res.json(payment);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: error.message });
    }
};

exports.createOfflinePayment = async (req, res) => {
    try {
        const { customerId, loanId, agentId, amount, paymentDate, notes, receiptImage } = req.body;

        if (!customerId || !loanId || !agentId || !amount) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const payment = await prisma.offlinePayment.create({
            data: {
                customerId: parseInt(customerId),
                loanId: parseInt(loanId),
                agentId: parseInt(agentId),
                amount: parseFloat(amount),
                paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                receiptImage,
                notes
            }
        });

        await logActivity({
            userId: req.user?.id || agentId,
            action: "Created Offline Payment",
            details: `Offline payment of ₦${amount} for loan #${loanId}`,
            entityType: "OfflinePayment",
            entityId: payment.id,
            ipAddress: req.ip
        });

        res.status(201).json(payment);
    } catch (error) {
        console.error("Offline Payment Error:", error);
        res.status(400).json({ error: error.message });
    }
};

exports.updateOfflinePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, paymentDate, notes, receiptImage } = req.body;

        const payment = await prisma.offlinePayment.findUnique({
            where: { id: parseInt(id) }
        });

        if (!payment) {
            return res.status(404).json({ error: "Offline payment not found" });
        }

        if (payment.status !== "pending") {
            return res.status(400).json({
                error: "Only pending payments can be updated"
            });
        }

        const updatedPayment = await prisma.offlinePayment.update({
            where: { id: parseInt(id) },
            data: {
                amount: amount ? parseFloat(amount) : undefined,
                paymentDate: paymentDate ? new Date(paymentDate) : undefined,
                receiptImage,
                notes
            }
        });

        await logActivity({
            userId: req.user.id,
            action: "Updated Offline Payment",
            entityType: "OfflinePayment",
            entityId: updatedPayment.id,
            ipAddress: req.ip
        });

        res.json(updatedPayment);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: error.message });
    }
};

exports.deleteOfflinePayment = async (req, res) => {
    try {
        const { id } = req.params;

        const payment = await prisma.offlinePayment.findUnique({
            where: { id: parseInt(id) }
        });

        if (!payment) {
            return res.status(404).json({ error: "Offline payment not found" });
        }

        if (payment.status !== "pending") {
            return res.status(400).json({
                error: "Only pending payments can be deleted"
            });
        }

        await prisma.offlinePayment.delete({
            where: { id: parseInt(id) }
        });

        await logActivity({
            userId: req.user.id,
            action: "Deleted Offline Payment",
            entityType: "OfflinePayment",
            entityId: payment.id,
            ipAddress: req.ip
        });

        res.json({ message: "Offline payment deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: error.message });
    }
};

exports.approveOfflinePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        const payment = await prisma.offlinePayment.findUnique({
            where: { id: parseInt(id) },
            include: {
                loan: {
                    include: {
                        installment: {
                            where: { status: { not: "paid" } },
                            orderBy: { expectedDate: "asc" }
                        }
                    }
                }
            }
        });

        if (!payment) return res.status(404).json({ error: "Offline payment not found" });
        if (payment.status !== "pending") return res.status(400).json({ error: "Payment already processed" });

        let remainingAmount = payment.amount;
        let totalApplied = 0;
        const operations = [];

        for (const installment of payment.loan.installment) {
            if (remainingAmount <= 0) break;

            const outstanding = installment.amountExpected - installment.amountPaid;
            const amountToPay = Math.min(outstanding, remainingAmount);

            remainingAmount -= amountToPay;
            totalApplied += amountToPay;

            const newAmountPaid = installment.amountPaid + amountToPay;
            const isFullyPaid = newAmountPaid >= installment.amountExpected;

            operations.push(
                prisma.installmentPayment.update({
                    where: { id: installment.id },
                    data: {
                        amountPaid: newAmountPaid,
                        status: isFullyPaid ? "paid" : "partial",
                        isWaiting: false
                    }
                })
            );

            operations.push(
                prisma.transaction.create({
                    data: {
                        loanId: payment.loanId,
                        installmentId: installment.id,
                        amount: amountToPay,
                        fieldOfficerId: payment.agentId,
                        branchId: payment.loan.branchId,
                        source: "offline_payment"
                    }
                })
            );
        }

        operations.push(
            prisma.loan.update({
                where: { id: payment.loanId },
                data: {
                    amountPaid: { increment: totalApplied }
                }
            })
        );

        operations.push(
            prisma.offlinePayment.update({
                where: { id: payment.id },
                data: {
                    status: "approved",
                    approvedBy: adminId
                }
            })
        );

        await prisma.$transaction(operations);

        const updatedLoan = await prisma.loan.findUnique({ where: { id: payment.loanId } });
        if (updatedLoan.amountPaid >= updatedLoan.totalToRepay) {
            await prisma.loan.update({
                where: { id: updatedLoan.id },
                data: { status: "completed" }
            });
        }

        await logActivity({
            userId: adminId,
            action: "Approved Offline Payment",
            details: `₦${payment.amount} applied to installments for loan #${payment.loanId}`,
            entityType: "OfflinePayment",
            entityId: payment.id,
            ipAddress: req.ip
        });

        res.json({
            message: "Offline payment approved and applied to installments",
            appliedAmount: totalApplied
        });

    } catch (error) {
        console.error("Approve Offline Payment Error:", error);
        res.status(400).json({ error: error.message });
    }
};

exports.rejectOfflinePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const payment = await prisma.offlinePayment.findUnique({
            where: { id: parseInt(id) }
        });

        if (!payment) {
            return res.status(404).json({ error: "Offline payment not found" });
        }

        if (payment.status !== "pending") {
            return res.status(400).json({
                error: "Payment already processed"
            });
        }

        const rejectedPayment = await prisma.offlinePayment.update({
            where: { id: parseInt(id) },
            data: {
                status: "rejected"
            }
        });

        await logActivity({
            userId: req.user.id,
            action: "Rejected Offline Payment",
            details: reason || "No reason provided",
            entityType: "OfflinePayment",
            entityId: rejectedPayment.id,
            ipAddress: req.ip
        });

        res.json({ message: "Offline payment rejected" });
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: error.message });
    }
};
