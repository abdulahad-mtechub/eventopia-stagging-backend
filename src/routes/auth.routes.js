const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middlewares/auth.middleware");

const {
  // Email/password auth (primary)
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  refreshToken,
  // User management
  getMe,
  setActiveRole,
  logout,
  logoutAll,
  setupAccount,
  updateProfile,
  // Network Manager OTP verification
  verifyOtpEmail,
  oauthRegister,
  // Guru checkout
  guruCheckout,
  resendOtp,
  // oauthCallback,
 kingsSendOtp,
kingsVerifyOtp,
// kingsMe,
// kingsLogout,
kingsRegister,
  oauthCallback,
  // Guru registration via invite
  guruRegisterViaInvite,
  createGuruInvite,
  resendGuruInvite,
  // Promoter registration via referral
  promoterRegisterViaReferral,
  validateReferralToken,
  createPromoterReferralInvite,
  resendPromoterReferralInvite,
} = require("../controllers/auth.controller");

// ========== Email/Password Authentication (Primary) ==========
router.post("/register", register);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/refresh", refreshToken);

// ========== OTP Verification (For Email/Password Registration) ==========
router.post("/otp/verify", verifyOtpEmail);
router.post('/otp/resend', resendOtp)

router.post("/oauth/register", oauthRegister);
router.post("/oauth/callback", oauthCallback);

// ========== Guru Registration via Invite ==========
router.post("/guru/register", guruRegisterViaInvite);

// ========== Promoter Registration via Guru Referral ==========
router.get("/referrals/validate/:token", validateReferralToken);
router.post("/promoter/register", promoterRegisterViaReferral);

// ========== Guru Routes (Create Promoter Referral Invites) ==========
router.post("/gurus/promoter/referral-invites", requireAuth, createPromoterReferralInvite);

// ========== Public Route: Resend Promoter Referral Invite (No Auth Required) ==========
router.post("/promoter/referral-invites/resend", resendPromoterReferralInvite);


// ========== Protected Routes ==========
router.get("/me", requireAuth, getMe);
router.post("/me/active-role", requireAuth, setActiveRole);
router.post("/logout", requireAuth, logout);
router.post("/logout-all", requireAuth, logoutAll);
router.post("/setup", requireAuth, setupAccount);
router.patch("/me", requireAuth, updateProfile);

// ========== Network Manager Routes (Create Guru Invites) ==========
router.post("/network-managers/guru/invites", requireAuth, createGuruInvite);

// ========== Public Route: Resend Guru Invite (No Auth Required) ==========
router.post("/guru/invites/resend", resendGuruInvite);

router.post("/king/register", kingsRegister);
router.post("/king/otp/send", kingsSendOtp);
router.post("/king/otp/verify", kingsVerifyOtp);
// router.get("/king/me", requireAuth, kingsMe);
// router.post("/king/logout", requireAuth, kingsLogout);

// Checkout routes
router.post("/guru/checkout", requireAuth, guruCheckout);

module.exports = router;
