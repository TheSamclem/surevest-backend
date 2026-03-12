const prisma = require("../lib/prisma");

exports.getBranches = async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            include: {
                _count: {
                    select: {
                        users: true,
                        customer: true,
                        staffs: true,
                        loan: true
                    }
                }
            }
        });
        res.json(branches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createBranch = async (req, res) => {
    try {
        const { name } = req.body;
        const branch = await prisma.branch.create({
            data: { name }
        });
        res.status(201).json(branch);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const branch = await prisma.branch.update({
            where: { id: parseInt(id) },
            data: { name }
        });
        res.json(branch);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteBranch = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.branch.delete({
            where: { id: parseInt(id) }
        });
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
