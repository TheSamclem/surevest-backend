const checkRank = (minRank) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // The rank is stored in the JWT payload during login
        if (req.user.rank < minRank) {
            return res.status(403).json({
                error: `Forbidden: This action requires at least Rank ${minRank}. Your rank: ${req.user.rank}`
            });
        }

        next();
    };
};

module.exports = { checkRank };
