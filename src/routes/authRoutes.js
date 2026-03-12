const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/login", authController.login);
router.get("/me", authMiddleware, authController.getMe);
router.get("/register-admin", authController.registerUserViaGet);

module.exports = router;
