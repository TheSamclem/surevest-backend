const prisma = require("../lib/prisma");

// Holiday Controllers
exports.getHolidays = async (req, res) => {
    try {
        const holidays = await prisma.holiday.findMany({
            orderBy: { date: 'asc' }
        });
        res.json(holidays);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createHoliday = async (req, res) => {
    try {
        const { name, date } = req.body;
        const holiday = await prisma.holiday.create({
            data: { name, date: new Date(date) }
        });
        res.status(201).json(holiday);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, date } = req.body;
        const holiday = await prisma.holiday.update({
            where: { id: parseInt(id) },
            data: {
                name,
                date: date ? new Date(date) : undefined
            }
        });
        res.json(holiday);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.holiday.delete({
            where: { id: parseInt(id) }
        });
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Charge Controllers
exports.getCharges = async (req, res) => {
    try {
        const charges = await prisma.charge.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(charges);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createCharge = async (req, res) => {
    try {
        const { name, amount, type, isRequired, description, collectionMethod } = req.body;
        const charge = await prisma.charge.create({
            data: {
                name,
                amount: parseFloat(amount),
                type: type || "FIXED",
                isRequired: isRequired !== undefined ? isRequired : true,
                collectionMethod: collectionMethod || "DEDUCTED",
                description
            }
        });
        res.status(201).json(charge);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateCharge = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, amount, type, isRequired, description, collectionMethod } = req.body;
        const charge = await prisma.charge.update({
            where: { id: parseInt(id) },
            data: {
                name,
                amount: amount !== undefined ? parseFloat(amount) : undefined,
                type: type || undefined,
                isRequired: isRequired !== undefined ? isRequired : undefined,
                collectionMethod: collectionMethod || undefined,
                description
            }
        });
        res.json(charge);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteCharge = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.charge.delete({
            where: { id: parseInt(id) }
        });
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Loan Type Controllers
exports.getLoanTypes = async (req, res) => {
    try {
        const loanTypes = await prisma.loanType.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(loanTypes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createLoanType = async (req, res) => {
    try {
        const { name, tenure, interestRate, interval, description, interestCollectionMethod = "DEDUCTED" } = req.body;
        if (!["DEDUCTED", "ADDED"].includes(interestCollectionMethod)) {
            return res.status(400).json({ error: "Invalid interest collection method. Use DEDUCTED or ADDED." });
        }
        const loanType = await prisma.loanType.create({
            data: {
                name,
                tenure: parseInt(tenure),
                interestRate: parseFloat(interestRate),
                interestCollectionMethod,
                interval: parseInt(interval),
                description
            }
        });
        res.status(201).json(loanType);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateLoanType = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, tenure, interestRate, interval, description, interestCollectionMethod } = req.body;
        if (interestCollectionMethod !== undefined && !["DEDUCTED", "ADDED"].includes(interestCollectionMethod)) {
            return res.status(400).json({ error: "Invalid interest collection method. Use DEDUCTED or ADDED." });
        }
        const loanType = await prisma.loanType.update({
            where: { id: parseInt(id) },
            data: {
                name,
                tenure: tenure !== undefined ? parseInt(tenure) : undefined,
                interestRate: interestRate !== undefined ? parseFloat(interestRate) : undefined,
                interestCollectionMethod: interestCollectionMethod || undefined,
                interval: interval !== undefined ? parseInt(interval) : undefined,
                description
            }
        });
        res.json(loanType);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteLoanType = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.loanType.delete({
            where: { id: parseInt(id) }
        });
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
