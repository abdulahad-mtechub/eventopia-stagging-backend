const {
  createPromoterReferralLink,
  getPromoterReferrals,
} = require("../services/promoterReferral.service");

async function createReferralLink(req, res) {
  try {
    const data = await createPromoterReferralLink(req.user.id);
    return res.status(201).json({
      error: false,
      message: "Referral link generated successfully.",
      data,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: true,
      message: err.message || "Failed to generate referral link.",
      data: null,
    });
  }
}

async function listPromoterReferrals(req, res) {
  try {
    const data = await getPromoterReferrals(req.user.id);
    return res.status(200).json({
      error: false,
      message: "Referrals retrieved successfully.",
      data,
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: "Failed to fetch referrals.",
      data: null,
    });
  }
}

module.exports = {
  createReferralLink,
  listPromoterReferrals,
};
