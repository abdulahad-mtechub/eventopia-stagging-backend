const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middlewares/auth.middleware");
const { requirePromoter } = require("../middlewares/auth.middleware");

const {
  createApplication,
  listMyApplications,
  getApplication,
  updateApplication,
  submitApplication,
  payApplicationFee,
  getApplicationStatus,
  getExecutions
} = require("../controllers/charity.controller");

// All charity routes require authentication and promoter role
router.use(requireAuth);
router.use(requirePromoter);

// Charity application routes
// router.post("/applications", createApplication);
// router.get("/applications", listMyApplications);
// router.get("/applications/:id", getApplication);
// router.put("/applications/:id", updateApplication);
// router.post("/applications/:id/submit", submitApplication);
// router.post("/applications/:id/pay-fee", payApplicationFee);
// router.get("/applications/:id/status", getApplicationStatus);
// router.get("/applications/:id/executions", getExecutions);

module.exports = router;
