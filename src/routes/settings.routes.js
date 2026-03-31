const express = require("express");
const router = express.Router();
const {
	getProfile,
	updateProfile,
	verifyEmail,
	getKingsAccountProfile,
	updateKingsAccountProfile,
	changeKingsAccountPassword,
	requestKingsPasswordChangeOtp,
	getKingsTwofaDevices,
	deleteKingsTwofaDevice,
} = require("../controllers/settings.controller");
const { changePasswordV1 } = require("../controllers/auth.controller");
const { requireAuth, requireKingsAccount } = require("../middlewares/auth.middleware");

/**
 * Settings Module Routes
 * Mounted at: /api/v1
 * 
 * Module 1: Settings — View + Edit Personal Details
 * Roles: Promoter, Guru, Network Manager
 */

/**
 * GET /api/v1/profile
 * Fetch current user profile
 * 
 * Response: { id, name, email, phone, role, territory (read-only) }
 */
router.get("/profile", requireAuth, getProfile);

/**
 * PUT /api/v1/profile
 * Update name, email, or phone
 * 
 * Request body: { name?, email?, phone?, current_password }
 * Response: { success: true, email_verification_sent?: true, challengeId?, expiresIn? }
 * 
 * Validations:
 * - Territory field must be read-only; reject any attempt to update it
 * - Email change must require current password confirmation
 * - Phone must pass E.164 format validation
 * - On email change: trigger re-verification email, invalidate current email until verified
 * - Save must be blocked if current password is not confirmed when needed
 * - Log all profile change attempts with timestamp and user ID
 */
router.put("/profile", requireAuth, updateProfile);

/**
 * POST /api/v1/verify-email
 * Verify email change by submitting OTP code sent to new email
 * 
 * Flow:
 * 1. User updates profile with new email (PUT /api/v1/profile)
 * 2. OTP code is sent to new email address
 * 3. User submits OTP code here to verify
 * 4. Email is marked as verified and becomes active
 * 
 * Request body: { email, otp_code, challenge_id }
 * Response: { success: true, email_verified: true }
 */
router.post("/verify-email", requireAuth, verifyEmail);

/**
 * Module 2: Settings — Change Password
 * Roles: Promoter, Guru, Network Manager, Buyer
 */

/**
 * POST /api/v1/auth/change-password
 * Change user password
 * 
 * Request: { current_password, new_password, confirm_new_password }
 * Response: { success: true, message: "Password updated successfully. Other sessions have been signed out." }
 * 
 * Validations:
 * - Validate current password against stored hash before processing
 * - New password must not match current password
 * - New password and confirm new password must match
 * - Enforce minimum password strength (min 8 chars, at least 1 number and 1 uppercase)
 * - On success: keep current session active but invalidate all other active sessions
 * - Log password change event with timestamp and IP
 */
router.post("/auth/change-password", requireAuth, changePasswordV1);

/**
 * Module 3: King's Account — Profile Settings (Authentication)
 * Role: kings_account
 *
 * API paths intentionally use /kings_account/* per integration request.
 */

// 4) GET /api/v1/kings_account/profile
router.get("/kings_account/profile", requireAuth, requireKingsAccount, getKingsAccountProfile);

// 5) PUT /api/v1/kings_account/profile
router.put("/kings_account/profile", requireAuth, requireKingsAccount, updateKingsAccountProfile);

// 6) POST /api/v1/kings_account/change-password
router.post("/kings_account/change-password", requireAuth, requireKingsAccount, changeKingsAccountPassword);

// 6a) POST /api/v1/kings_account/change-password/request-otp
router.post("/kings_account/change-password/request-otp", requireAuth, requireKingsAccount, requestKingsPasswordChangeOtp);

// 7) GET /api/v1/kings_account/2fa/devices
router.get("/kings_account/2fa/devices", requireAuth, requireKingsAccount, getKingsTwofaDevices);

// 8) DELETE /api/v1/kings_account/2fa/devices/:id
router.delete("/kings_account/2fa/devices/:id", requireAuth, requireKingsAccount, deleteKingsTwofaDevice);

module.exports = router;
