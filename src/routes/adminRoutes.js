const express = require("express");
const router = express.Router();
const adminDashboardController = require("../controllers/adminDashboardController");
const adminRoleController = require("../controllers/adminRoleController");
const adminBranchController = require("../controllers/adminBranchController");
const adminSystemController = require("../controllers/adminSystemController");
const adminUserController = require("../controllers/adminUserController");
const adminCustomerController = require("../controllers/adminCustomerController");
const adminLoanController = require("../controllers/adminLoanController");
const adminReportController = require("../controllers/adminReportController");
const adminOfflinePaymentController = require("../controllers/adminOfflinePaymentController");
const adminMigrationController = require("../controllers/adminMigrationController");
const adminTransactionController = require("../controllers/adminTransactionController");
const adminSavingsController = require("../controllers/adminSavingsController");

const paymentController = require("../controllers/paymentController");
const { checkRank } = require("../middleware/roleMiddleware");

// Dashboard Stats
router.get("/dashboard-stats", adminDashboardController.getDashboardStats);

// Roles routes
router.get("/roles", adminRoleController.getRoles);
router.post("/roles", checkRank(4), adminRoleController.createRole);
router.put("/roles/:id", checkRank(4), adminRoleController.updateRole);
router.delete("/roles/:id", checkRank(4), adminRoleController.deleteRole);

// Branches routes
router.get("/branches", adminBranchController.getBranches);
router.post("/branches", checkRank(4), adminBranchController.createBranch);
router.put("/branches/:id", checkRank(4), adminBranchController.updateBranch);
router.delete("/branches/:id", checkRank(4), adminBranchController.deleteBranch);

// Holiday routes
router.get("/holidays", adminSystemController.getHolidays);
router.post("/holidays", adminSystemController.createHoliday);
router.put("/holidays/:id", adminSystemController.updateHoliday);
router.delete("/holidays/:id", adminSystemController.deleteHoliday);

// User routes
router.get("/users", adminUserController.getUsers);
router.post("/users", adminUserController.createUser);
router.put("/users/:id", adminUserController.updateUser);
router.delete("/users/:id", adminUserController.deleteUser);
router.put("/users/:id/approve", adminUserController.approveUser);
router.put("/users/:id/toggle-status", adminUserController.toggleUserStatus);

// Customer routes
router.get("/customers", ensureHandler(adminCustomerController.getCustomers));
// Get customers assigned to the authenticated agent or by query ?agentId=<id>
router.get("/customers/assigned", ensureHandler(adminCustomerController.getCustomersAssigned));
router.get("/admin/customers/assigned", ensureHandler(adminCustomerController.getCustomersAssigned));
router.post("/customers", ensureHandler(adminCustomerController.createCustomer));
router.put("/customers/:id", ensureHandler(adminCustomerController.updateCustomer));
router.delete("/customers/:id", ensureHandler(adminCustomerController.deleteCustomer));
router.put("/customers/:id/approve", checkRank(5), ensureHandler(adminCustomerController.approveCustomer));
router.put("/customers/:id/reject", checkRank(5), ensureHandler(adminCustomerController.rejectCustomer));
router.get("/customers/:id/loans", ensureHandler(adminCustomerController.getCustomerLoans));
router.get("/customers/:id/transactions", ensureHandler(adminCustomerController.getCustomerTransactions));
router.get("/customers/:id/savings", ensureHandler(adminCustomerController.getCustomerSavings));
router.post("/customers/:id/kyc", adminCustomerController.saveKycDetails);
router.post("/customers/:id/regenerate-virtual-account", ensureHandler(adminCustomerController.regenerateVirtualAccount));
router.post("/customers/regenerate-virtual-accounts", checkRank(5), ensureHandler(adminCustomerController.regenerateAllVirtualAccounts));

// Verification and Payment routes
router.get("/banks", paymentController.getBanks);
router.post("/verify-account", paymentController.verifyAccountNumber);
router.post("/verify-nin", paymentController.verifyNIN);
router.post("/verify-bvn", paymentController.verifyBVN);
router.post("/verify-bvn-phone", paymentController.verifyBVNWithPhone);
router.post("/credit-history", paymentController.getCreditHistory);
router.post("/init-direct-debit", paymentController.initDirectDebit);
router.get("/direct-debit/authorization/verify/:reference", paymentController.verifyDirectDebitAuthorization);
router.get("/direct-debit/mandates", paymentController.listDirectDebitMandates);
router.put("/direct-debit/activation-charge", paymentController.triggerDirectDebitActivation);
router.post("/direct-debit/charge", paymentController.chargeDirectDebit);

// Permission routes
router.get("/permissions", checkRank(4), adminRoleController.getPermissions);
router.get("/roles/:id/permissions", checkRank(4), adminRoleController.getRoleWithPermissions);
router.put("/roles/:id/permissions", checkRank(4), adminRoleController.updateRolePermissions);
router.get("/users/:id/permissions", checkRank(4), adminRoleController.getUserWithPermissions);
router.put("/users/:id/permissions", checkRank(4), adminRoleController.updateUserPermissions);

// Charge routes
router.get("/charges", adminSystemController.getCharges);
router.post("/charges", checkRank(4), adminSystemController.createCharge);
router.put("/charges/:id", checkRank(4), adminSystemController.updateCharge);
router.delete("/charges/:id", checkRank(4), adminSystemController.deleteCharge);

// Loan Type routes
router.get("/loan-types", adminSystemController.getLoanTypes);
router.post("/loan-types", checkRank(4), adminSystemController.createLoanType);
router.put("/loan-types/:id", checkRank(4), adminSystemController.updateLoanType);
router.delete("/loan-types/:id", checkRank(4), adminSystemController.deleteLoanType);

// General Loan management
router.get("/loans", adminLoanController.getLoans);
router.get("/loans/disbursed", adminLoanController.getDisbursedLoans);
router.get("/loans/waiting-disbursal", adminLoanController.getWaitingDisbursalLoans);
router.get("/loans/expired", adminLoanController.getExpiredLoans);
router.post("/loans", adminLoanController.createLoan);
router.put("/loans/:id/approve", checkRank(5), adminLoanController.approveLoan);
router.put("/loans/:id/disburse", checkRank(5), adminLoanController.disburseLoan);
router.put("/loans/:id/reject", checkRank(5), adminLoanController.rejectLoan);

// Activity Logs
router.get("/activity-logs", adminDashboardController.getActivityLogs);

// Offline Payments
router.get("/offline-payments", ensureHandler(adminOfflinePaymentController.getOfflinePayments));
// assigned + admin variants
router.get("/offline-payments/assigned", ensureHandler(adminOfflinePaymentController.getOfflinePaymentsAssigned));
router.get("/admin/offline-payments/assigned", ensureHandler(adminOfflinePaymentController.getOfflinePaymentsAssigned));
// single / edit / delete endpoints
router.get("/offline-payments/:id", ensureHandler(adminOfflinePaymentController.getOfflinePayment));
router.put("/offline-payments/:id", ensureHandler(adminOfflinePaymentController.updateOfflinePayment));
router.delete("/offline-payments/:id", ensureHandler(adminOfflinePaymentController.deleteOfflinePayment));
router.post("/offline-payments", ensureHandler(adminOfflinePaymentController.createOfflinePayment));
router.put("/offline-payments/:id/approve", ensureHandler(adminOfflinePaymentController.approveOfflinePayment));
router.put("/offline-payments/:id/reject", ensureHandler(adminOfflinePaymentController.rejectOfflinePayment));

// admin-prefixed duplicates (for mobile calls using /api/admin/...)
router.post("/admin/offline-payments", ensureHandler(adminOfflinePaymentController.createOfflinePayment));
router.get("/admin/offline-payments/:id", ensureHandler(adminOfflinePaymentController.getOfflinePayment));
router.put("/admin/offline-payments/:id", ensureHandler(adminOfflinePaymentController.updateOfflinePayment));
router.delete("/admin/offline-payments/:id", ensureHandler(adminOfflinePaymentController.deleteOfflinePayment));
router.put("/admin/offline-payments/:id/approve", ensureHandler(adminOfflinePaymentController.approveOfflinePayment));
router.put("/admin/offline-payments/:id/reject", ensureHandler(adminOfflinePaymentController.rejectOfflinePayment));

// Webhook Transactions
router.get("/transactions/paystack-webhook", ensureHandler(adminTransactionController.getWebhookTransactions));
router.get("/savings", ensureHandler(adminSavingsController.getSavingsTransactions));
router.post("/savings/deposit", ensureHandler(adminSavingsController.createSavingsDeposit));
router.post("/savings/withdraw", ensureHandler(adminSavingsController.createSavingsWithdrawal));

// Installments (collections)
router.get("/installments/assigned", ensureHandler(adminLoanController.getInstallmentsAssigned));
router.get("/admin/installments/assigned", ensureHandler(adminLoanController.getInstallmentsAssigned));
router.get("/installments/overdue", ensureHandler(adminLoanController.getOverdueInstallments));
router.get("/admin/installments/overdue", ensureHandler(adminLoanController.getOverdueInstallments));
router.get("/installments/:id", ensureHandler(adminLoanController.getInstallment));
router.get("/admin/installments/:id", ensureHandler(adminLoanController.getInstallment));
router.put("/installments/:id/collect", ensureHandler(adminLoanController.collectInstallment));
router.put("/admin/installments/:id/collect", ensureHandler(adminLoanController.collectInstallment));

// Reports
router.get("/reports", checkRank(3), ensureHandler(adminReportController.getReports));
router.get("/admin/reports", checkRank(3), ensureHandler(adminReportController.getReports));
router.get("/reports/agents", checkRank(3), ensureHandler(adminReportController.getAgentReports));
router.get("/admin/reports/agents", checkRank(3), ensureHandler(adminReportController.getAgentReports));
router.get("/reports/branches", checkRank(3), ensureHandler(adminReportController.getBranchReports));
router.get("/admin/reports/branches", checkRank(3), ensureHandler(adminReportController.getBranchReports));
router.get("/reports/income", checkRank(3), ensureHandler(adminReportController.getIncomeReport));
router.get("/admin/reports/income", checkRank(3), ensureHandler(adminReportController.getIncomeReport));
router.get("/reports/profit-loss", checkRank(3), ensureHandler(adminReportController.getProfitLoss));
router.get("/admin/reports/profit-loss", checkRank(3), ensureHandler(adminReportController.getProfitLoss));
router.post("/reports/profit-loss/entry", checkRank(3), ensureHandler(adminReportController.createProfitLossEntry));
router.post("/admin/reports/profit-loss/entry", checkRank(3), ensureHandler(adminReportController.createProfitLossEntry));

// Direct Debit
router.get("/direct-debit/customers", ensureHandler(adminCustomerController.getCustomersForDirectDebit));
router.get("/admin/direct-debit/customers", ensureHandler(adminCustomerController.getCustomersForDirectDebit));

// Migration
router.post("/migrate-customers", checkRank(5), ensureHandler(adminMigrationController.migrateCustomers));

// helper to avoid "argument handler must be a function" when a handler is missing
function ensureHandler(fn) {
	// always return a function the router can call
	if (typeof fn === 'function') {
		return fn;
	}
	return (req, res) => res.status(501).json({ error: 'Not implemented' });
}

module.exports = router;
