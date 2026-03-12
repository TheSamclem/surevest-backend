const prisma = require("../lib/prisma");

// Roles Controllers
exports.getRoles = async (req, res) => {
    try {
        const roles = await prisma.role.findMany({
            include: {
                _count: {
                    select: { users: true, staffs: true }
                }
            }
        });
        res.json(roles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createRole = async (req, res) => {
    try {
        const { name, rank } = req.body;
        const role = await prisma.role.create({
            data: {
                name,
                rank: parseInt(rank) || 1
            }
        });
        res.status(201).json(role);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, rank } = req.body;
        const role = await prisma.role.update({
            where: { id: parseInt(id) },
            data: {
                name,
                rank: rank ? parseInt(rank) : undefined
            }
        });
        res.json(role);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.deleteRole = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.role.delete({
            where: { id: parseInt(id) }
        });
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Permissions Controllers
exports.getPermissions = async (req, res) => {
    try {
        const permissions = await prisma.permission.findMany();
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getRoleWithPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const role = await prisma.role.findUnique({
            where: { id: parseInt(id) },
            include: { permissions: true }
        });
        res.json(role);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateRolePermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const { permissionIds } = req.body; // Array of permission IDs

        const role = await prisma.role.update({
            where: { id: parseInt(id) },
            data: {
                permissions: {
                    set: permissionIds.map(pid => ({ id: parseInt(pid) }))
                }
            }
        });
        res.json(role);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getUserWithPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            include: {
                role: {
                    include: { permissions: true }
                },
                permissions: true
            }
        });
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.updateUserPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const { permissionIds } = req.body;

        const user = await prisma.user.update({
            where: { id: parseInt(id) },
            data: {
                permissions: {
                    set: permissionIds.map(pid => ({ id: parseInt(pid) }))
                }
            }
        });
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
