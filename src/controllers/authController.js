const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            include: { role: true, branch: true }
        });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        if (user.status !== "active") {
            return res.status(403).json({ error: "User account is not active. Please contact administrator." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role.name, rank: user.role.rank, branchId: user.branchId },
            process.env.JWT_SECRET || "fallback_secret",
            { expiresIn: "24h" }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                surname: user.surname,
                othername: user.othername,
                role: user.role,
                branch: user.branch
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { role: true, branch: true }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.registerUserViaGet = async (req, res) => {
    try {
        const { surname, othername, email, password, phoneNumber, gender, roleName, branchName } = req.query;

        if (!email || !password || !surname) {
            return res.status(400).json({ error: "Missing required fields: email, password, surname" });
        }

        // 1. Ensure Role exists
        const role = await prisma.role.upsert({
            where: { name: roleName || "Administrator" },
            update: {},
            create: { name: roleName || "Administrator", rank: 5 }
        });

        // 2. Ensure Branch exists
        const branch = await prisma.branch.upsert({
            where: { name: branchName || "Main Branch" },
            update: {},
            create: { name: branchName || "Main Branch" }
        });

        // 3. Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Create User
        const user = await prisma.user.upsert({
            where: { email },
            update: {
                surname,
                othername: othername || "",
                password: hashedPassword,
                phoneNumber: phoneNumber || "0000000000",
                gender: gender || "Other",
                role_id: role.id,
                branchId: branch.id,
                status: "active"
            },
            create: {
                surname,
                othername: othername || "",
                email,
                password: hashedPassword,
                phoneNumber: phoneNumber || "0000000000",
                gender: gender || "Other",
                role_id: role.id,
                branchId: branch.id,
                status: "active"
            }
        });

        res.json({
            message: "User registered successfully via GET",
            user: {
                id: user.id,
                email: user.email,
                role: role.name,
                status: user.status
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
