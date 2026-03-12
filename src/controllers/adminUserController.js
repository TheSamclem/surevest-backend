const prisma = require("../lib/prisma");
const { logActivity } = require("../lib/logger");
const bcrypt = require('bcryptjs');

exports.getUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            include: {
                role: true,
                branch: true,
                _count: { select: { customer: true, transactions: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { surname, othername, gender, password, email, phoneNumber, role_id, branchId } = req.body;

        // Hash password before storing
        if (!password) {
            return res.status(400).json({ error: "Password is required" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                surname,
                othername,
                gender,
                password: hashedPassword,
                email,
                phoneNumber,
                role_id: parseInt(role_id),
                branchId: parseInt(branchId),
                status: "inactive" // Needs approval
            },
            include: { role: true, branch: true }
        });
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { surname, othername, gender, email, phoneNumber, role_id, branchId, status, password } = req.body;

        // If password provided, hash it
        let passwordHash;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }

        const user = await prisma.user.update({
            where: { id: parseInt(id) },
            data: {
                surname,
                othername,
                gender,
                email,
                phoneNumber,
                role_id: role_id ? parseInt(role_id) : undefined,
                branchId: branchId ? parseInt(branchId) : undefined,
                status,
                ...(passwordHash ? { password: passwordHash } : {})
            },
            include: { role: true, branch: true }
        });
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({
            where: { id: parseInt(id) }
        });
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.approveUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { status: "active" },
            include: { role: true, branch: true }
        });
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const currentAdminId = req.user?.id || 1;

        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) }
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const newStatus = user.status === "active" ? "inactive" : "active";

        const updatedUser = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { status: newStatus }
        });

        await logActivity({
            userId: parseInt(currentAdminId),
            action: newStatus === "active" ? "Activated User" : "Deactivated User",
            details: `${newStatus === "active" ? "Activated" : "Deactivated"} account for ${user.surname} ${user.othername}`,
            entityType: "User",
            entityId: user.id,
            ipAddress: req.ip
        });

        res.json(updatedUser);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getUserWithPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            include: { permissions: true, role: true }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
