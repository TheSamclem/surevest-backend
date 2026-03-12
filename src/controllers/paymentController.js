const axios = require("axios");
const crypto = require("crypto");
const prisma = require("../lib/prisma");

const paystackClient = axios.create({
    baseURL: "https://api.paystack.co",
    headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
    }
});

exports.getBanks = async (req, res) => {
    try {
        const response = await axios.get("https://api.paystack.co/bank", {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
        });
        res.json(response.data.data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch banks" });
    }
};

exports.verifyAccountNumber = async (req, res) => {
    try {
        const { account_number, bank_code } = req.body;

        if (!account_number || !bank_code) {
            return res.status(400).json({ error: "Account number and bank code are required" });
        }

        const response = await axios.get(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
        });

        res.json({
            success: true,
            account_name: response.data.data.account_name
        });
    } catch (error) {
        const message = error.response?.data?.message || "Verification failed";
        res.status(400).json({ error: message });
    }
};

exports.initDirectDebit = async (req, res) => {
    try {
        const {
            customerId,
            email,
            callback_url,
            account,
            address
        } = req.body;

        if (!email) {
            return res.status(400).json({ error: "email is required" });
        }

        const callbackUrl = callback_url || `${process.env.FRONTEND_URL}/dashboard/mandates`;
        const hasPrefill = !!(account && address);

        let response;
        if (customerId && hasPrefill) {
            response = await paystackClient.post(`/customer/${customerId}/initialize-direct-debit`, {
                account,
                address
            });
        } else {
            response = await paystackClient.post("/customer/authorization/initialize", {
                email,
                channel: "direct_debit",
                callback_url: callbackUrl,
                ...(account && address ? { account, address } : {})
            });
        }

        res.json(response.data.data);
    } catch (error) {
        const message = error.response?.data?.message || "Direct debit initialization failed";
        res.status(400).json({ error: message });
    }
};

exports.verifyDirectDebitAuthorization = async (req, res) => {
    try {
        const { reference } = req.params;
        if (!reference) return res.status(400).json({ error: "reference is required" });

        const response = await paystackClient.get(`/customer/authorization/verify/${reference}`);
        res.json(response.data.data);
    } catch (error) {
        const message = error.response?.data?.message || "Authorization verification failed";
        res.status(400).json({ error: message });
    }
};

exports.listDirectDebitMandates = async (req, res) => {
    try {
        const { status, cursor, per_page = 100 } = req.query;
        const response = await paystackClient.get("/directdebit/mandate-authorizations", {
            params: {
                ...(status ? { status } : {}),
                ...(cursor ? { cursor } : {}),
                per_page
            }
        });
        res.json(response.data);
    } catch (error) {
        const message = error.response?.data?.message || "Failed to fetch direct debit mandates";
        res.status(400).json({ error: message });
    }
};

exports.triggerDirectDebitActivation = async (req, res) => {
    try {
        const { customer_ids } = req.body;
        if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
            return res.status(400).json({ error: "customer_ids must be a non-empty array" });
        }

        const response = await paystackClient.put("/directdebit/activation-charge", { customer_ids });
        res.json(response.data);
    } catch (error) {
        const message = error.response?.data?.message || "Activation charge trigger failed";
        res.status(400).json({ error: message });
    }
};

const findActiveMandateAuthorization = async ({ email, customerCode }) => {
    let cursor = null;
    let page = 0;

    while (page < 5) {
        const response = await paystackClient.get("/directdebit/mandate-authorizations", {
            params: { status: "active", per_page: 100, ...(cursor ? { cursor } : {}) }
        });
        const payload = response.data?.data || [];
        const match = payload.find((m) => {
            const mandateEmail = m?.customer?.email?.toLowerCase();
            const mandateCode = m?.customer?.customer_code;
            return (
                (email && mandateEmail === String(email).toLowerCase()) ||
                (customerCode && mandateCode === customerCode)
            );
        });
        if (match) return match;

        const next = response.data?.meta?.next;
        if (!next) break;
        cursor = next;
        page += 1;
    }

    return null;
};

exports.chargeDirectDebit = async (req, res) => {
    try {
        const { customerId, email, amount, reference, authorization_code } = req.body;
        if (!email || !amount) return res.status(400).json({ error: "email and amount are required" });

        let authCode = authorization_code || null;
        if (!authCode) {
            let customerCode = null;
            if (customerId) {
                const customer = await prisma.customer.findUnique({
                    where: { id: parseInt(customerId) },
                    select: { customer_code: true, email: true }
                });
                customerCode = customer?.customer_code || null;
            }

            const mandate = await findActiveMandateAuthorization({ email, customerCode });
            if (!mandate?.authorization_code) {
                return res.status(400).json({ error: "No active direct debit mandate found for customer" });
            }
            authCode = mandate.authorization_code;
        }

        const amountKobo = Math.round(parseFloat(amount) * 100);
        if (!amountKobo || amountKobo <= 0) {
            return res.status(400).json({ error: "Invalid amount" });
        }

        const charge = await paystackClient.post("/transaction/charge_authorization", {
            email,
            amount: String(amountKobo),
            authorization_code: authCode,
            ...(reference ? { reference } : {})
        });

        res.json(charge.data.data);
    } catch (error) {
        const message = error.response?.data?.message || "Direct debit charge failed";
        res.status(400).json({ error: message });
    }
};

// Zeeh Africa Key (should be in .env)
const ZEEH_SECRET_KEY = process.env.ZEEH_SECRET_KEY || "YOUR_ZEEH_SECRET_KEY";
const ZEEH_BASE_URL = process.env.ZEEH_BASE_URL || "https://api.usezeeh.com/v1";

exports.verifyNIN = async (req, res) => {
    try {
        const { nin } = req.body;
        if (!nin || nin.length !== 11 && nin.length !== 10) { // NIN can be 11, vNIN can be 16 or 11
            return res.status(400).json({ error: "Invalid NIN." });
        }

        console.log(`Verifying NIN with Zeeh: ${nin.substring(0, 3)}... using key ${ZEEH_SECRET_KEY.substring(0, 10)}...`);

        const response = await axios.post(`${ZEEH_BASE_URL}/nigeria_kyc/lookup_nin`, {
            nin
        }, {
            headers: {
                "Secret_Key": ZEEH_SECRET_KEY,
                "Secret-Key": ZEEH_SECRET_KEY, // Try hyphenated as well
                "x-api-key": ZEEH_SECRET_KEY,   // Try x-api-key common fallback
                "Authorization": `Bearer ${ZEEH_SECRET_KEY}`, // Try Bearer
                "Content-Type": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error("Zeeh NIN Error Detail:", error.response?.data || error.message);
        const message = error.response?.data?.message || "NIN verification failed";
        res.status(400).json({
            error: message,
            details: error.response?.data,
            hint: "Check if your Zeeh Secret Key is correct and 'Identity Verification' is enabled in your Zeeh Dashboard."
        });
    }
};

exports.verifyBVN = async (req, res) => {
    try {
        const { bvn } = req.body;
        if (!bvn || bvn.length !== 11) {
            return res.status(400).json({ error: "Invalid BVN. Must be 11 digits." });
        }

        console.log(`Verifying BVN with Zeeh: ${bvn.substring(0, 3)}...`);

        const response = await axios.post(`${ZEEH_BASE_URL}/nigeria_kyc/lookup_bvn`, {
            bvn
        }, {
            headers: {
                "Secret_Key": ZEEH_SECRET_KEY,
                "Secret-Key": ZEEH_SECRET_KEY,
                "x-api-key": ZEEH_SECRET_KEY,
                "Authorization": `Bearer ${ZEEH_SECRET_KEY}`,
                "Content-Type": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error("Zeeh BVN Error Detail:", error.response?.data || error.message);
        const message = error.response?.data?.message || "BVN verification failed";
        res.status(400).json({
            error: message,
            details: error.response?.data
        });
    }
};

exports.verifyBVNWithPhone = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: "Phone number is required." });
        }

        console.log(`Verifying BVN via phone with Zeeh: ${phoneNumber.substring(0, 5)}...`);

        const response = await axios.post(`${ZEEH_BASE_URL}/nigeria_kyc/lookup_bvn_with_phone`, {
            phoneNumber
        }, {
            headers: {
                "Secret_Key": ZEEH_SECRET_KEY,
                "Secret-Key": ZEEH_SECRET_KEY,
                "x-api-key": ZEEH_SECRET_KEY,
                "Authorization": `Bearer ${ZEEH_SECRET_KEY}`,
                "Content-Type": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error("Zeeh BVN-Phone Error Detail:", error.response?.data || error.message);
        const message = error.response?.data?.message || "BVN verification via phone failed";
        res.status(400).json({
            error: message,
            details: error.response?.data
        });
    }
};

exports.getCreditHistory = async (req, res) => {
    try {
        const { bvn } = req.body;
        if (!bvn) {
            return res.status(400).json({ error: "BVN is required." });
        }

        console.log(`Fetching credit history with Zeeh V2: ${bvn.substring(0, 3)}...`);

        // Note: Using requested production base URL for credit history
        const ZEEH_V2_URL = "https://v2.api.zeeh.africa";

        const response = await axios.post(`${ZEEH_V2_URL}/credit_reports/crc_premium`, {
            bvn
        }, {
            headers: {
                "Secret_Key": ZEEH_SECRET_KEY,
                "Content-Type": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error("Zeeh Credit Report Error detail:", error.response?.data || error.message);
        const message = error.response?.data?.message || "Failed to retrieve credit history";
        res.status(400).json({
            error: message,
            details: error.response?.data
        });
    }
};

// Helper function to create a Paystack customer first, then a dedicated virtual account
exports.createVirtualAccount = async (email, firstName, lastName, phone) => {
    try {
        // Step 1: Create customer in Paystack
        const customerResponse = await axios.post("https://api.paystack.co/customer", {
            email,
            first_name: firstName,
            last_name: lastName,
            phone: phone || ""
        }, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json"
            }
        });

        if (!customerResponse.data.status || !customerResponse.data.data) {
            return {
                success: false,
                error: "Failed to create Paystack customer"
            };
        }

        const customerId = customerResponse.data.data.id;
        console.log("Created Paystack customer:", customerId);

        // Step 2: Create dedicated virtual account using customer ID
        const accountResponse = await axios.post("https://api.paystack.co/dedicated_account", {
            customer: customerId,
            preferred_bank: "wema-bank" // or use "test-bank" for sandbox
        }, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json"
            }
        });

        if (accountResponse.data.status && accountResponse.data.data) {
            return {
                success: true,
                customerId: customerId,
                paystackCustomerId: customerResponse.data.data.customer_code,
                accountNumber: accountResponse.data.data.account_number,
                bankName: accountResponse.data.data.bank?.name || "Paystack",
                bankCode: accountResponse.data.data.bank?.code
            };
        }
        return { success: false, error: "Failed to create virtual account" };
    } catch (error) {
        console.error("Virtual account creation error:", error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || "Failed to create virtual account"
        };
    }
};

/**
 * Handle Paystack Webhook
 */
exports.handlePaystackWebhook = async (req, res) => {
    try {
        const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');
        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(401).send('Invalid signature');
        }

        const event = req.body;
        console.log("Paystack Webhook Event:", event.event);

        if (event.event === "direct_debit.authorization.active" || event.event === "direct_debit.authorization.inactive") {
            const email = event.data?.customer?.email || event.data?.email;
            if (email) {
                await prisma.customer.updateMany({
                    where: { email: String(email).toLowerCase() },
                    data: {
                        mandateStatus: event.event === "direct_debit.authorization.active"
                            ? "ENROLLED"
                            : "NOT_ENROLLED"
                    }
                });
            }
            return res.json({ status: "success" });
        }

        if (event.event === 'charge.success') {
            const { amount, customer, reference } = event.data;
            const email = customer.email;
            const paidAmount = amount / 100;

            // Find customer and their active loan
            const dbCustomer = await prisma.customer.findFirst({
                where: { email: email },
                include: {
                    loans: {
                        where: { status: "active", isDisbursed: true },
                        include: {
                            installment: {
                                where: { status: { not: "paid" } },
                                orderBy: { expectedDate: "asc" }
                            }
                        }
                    }
                }
            });

            if (!dbCustomer || dbCustomer.loans.length === 0) {
                console.log(`No active loan found for customer ${email}`);
                return res.json({ status: "ignored" });
            }

            const loan = dbCustomer.loans[0];
            let remainingAmount = paidAmount;
            let totalApplied = 0;
            const operations = [];

            for (const installment of loan.installment) {
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
                            status: isFullyPaid ? "paid" : "partial"
                        }
                    })
                );

                operations.push(
                    prisma.transaction.create({
                        data: {
                            loanId: loan.id,
                            installmentId: installment.id,
                            amount: amountToPay,
                            fieldOfficerId: loan.fieldOfficerId,
                            branchId: loan.branchId,
                            source: "paystack_webhook",
                            reference: reference || null
                        }
                    })
                );
            }

            operations.push(
                prisma.loan.update({
                    where: { id: loan.id },
                    data: {
                        amountPaid: { increment: totalApplied }
                    }
                })
            );

            await prisma.$transaction(operations);

            // Check if fully paid
            const updatedLoan = await prisma.loan.findUnique({ where: { id: loan.id } });
            if (updatedLoan.amountPaid >= updatedLoan.totalToRepay) {
                await prisma.loan.update({
                    where: { id: updatedLoan.id },
                    data: { status: "completed" }
                });
            }

            console.log(`Successfully applied Paystack payment of ${paidAmount} to loan ${loan.id} for ${email}`);
        }

        res.json({ status: "success" });
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ error: error.message });
    }
};
