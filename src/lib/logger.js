const prisma = require("./prisma");

/**
 * Logs a user activity to the database
 * @param {number} userId - ID of the user performing the action
 * @param {string} action - Description of the action (e.g., "Approved Loan")
 * @param {string} details - Detailed info (e.g., "Loan #123 for $5000")
 * @param {string} entityType - Type of entity affected (e.g., "Loan", "Customer")
 * @param {number} entityId - ID of the entity affected
 * @param {string} ipAddress - IP address of the user
 */
const logActivity = async ({ userId, action, details, entityType, entityId, ipAddress }) => {
    try {
        await prisma.activityLog.create({
            data: {
                userId,
                action,
                details,
                entityType,
                entityId,
                ipAddress
            }
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
};

module.exports = { logActivity };
