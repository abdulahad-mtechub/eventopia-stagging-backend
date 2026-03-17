const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireOrderOwnership } = require("../middlewares/auth.middleware");
const { createOrderLimiter, cancelOrderLimiter } = require("../middlewares/rateLimiter.middleware");
const {
  createOrder,
  getOrderDetails,
  getMyOrders,
  getMyTickets,
  cancelOrder,
  getOrderTickets,
  getTicketDetails,
  getTicketQR,
  checkoutOrder,
} = require("../controllers/orders.controller");

/**
 * Buyer Order Flow Routes
 * Base path: /api/orders
 * All routes require authentication
 */

// Create a new order (FIXED: removed /events prefix)
router.post(
  "/events/:eventId/orders",
  requireAuth,
  createOrderLimiter,
  createOrder
);

// Get order details (FIXED: removed /orders prefix)
router.get(
  "/:orderId",
  requireAuth,
  requireOrderOwnership,
  getOrderDetails
);

// Get current user's orders
router.get(
  "/me/orders",
  requireAuth,
  getMyOrders
);

// Get current user's tickets (with optional filters)
router.get(
  "/me/tickets",
  requireAuth,
  getMyTickets
);

// Cancel an order (FIXED: removed /orders prefix)
router.post(
  "/:orderId/cancel",
  requireAuth,
  requireOrderOwnership,
  cancelOrderLimiter,
  cancelOrder
);

// Get tickets for an order (FIXED: removed /orders prefix)
router.get(
  "/:orderId/tickets",
  requireAuth,
  requireOrderOwnership,
  getOrderTickets
);

// Get single ticket details
router.get(
  "/tickets/:ticketId",
  requireAuth,
  getTicketDetails
);

// Get ticket QR payload (buyer only)
router.get(
  "/tickets/:ticketId/qr",
  requireAuth,
  getTicketQR
);

// Checkout/Complete order
router.post(
  "/:orderId/checkout",
  requireAuth,
  requireOrderOwnership,
  checkoutOrder
);

module.exports = router;