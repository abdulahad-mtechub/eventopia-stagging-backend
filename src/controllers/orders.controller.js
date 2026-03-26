// orders.controller.js
// Implements ONLY the 5 endpoints defined in Module 3 — Ticket Purchase Flow

const pool = require("../db");

const crypto = require("crypto");
const { ok, fail } = require("../utils/standardResponse");

const { receiveTicketPayment } = require("../services/escrowReceive.service");
const { allocateCredit } = require("../services/allocateCredit.service");
const { resolveTier } = require("../services/tierResolver.service");
const { logTicketAudit } = require("../services/audit.service");
const { logValidationAttempt } = require("../services/validationLog.service");

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Sign a payload into a SHA-256 HMAC hash used as the QR code hash.
 * SECRET must be set in environment variables.
 */
const signQRHash = (payload) => {
  const secret = process.env.QR_SECRET || "changeme_secret";
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
};

/**
 * Build the QR payload and its signed hash for an order item / ticket.
 */
const buildQR = ({ ticketItemId, orderId, eventId, buyerId, attendeeName, tierName }) => {
  // Keep response payload field names snake_case as in Module 3 document.
  const qrPayload = {
    ticket_item_id: ticketItemId,
    order_id: orderId,
    event_id: eventId,
    buyer_id: buyerId,
    attendee_name: attendeeName,
    tier_name: tierName,
  };
  const qrCodeHash = signQRHash(qrPayload);
  return { qrPayload, qrCodeHash };
};

/**
 * Verify a raw QR hash against a known payload.
 */
const verifyQRHash = (hash, payload) => {
  const expected = signQRHash(payload);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
};

// ─────────────────────────────────────────────
// SERVICE 1 — POST /orders
// ─────────────────────────────────────────────

/**
 * Create a new order in pending status.
 * Auth: required — role: buyer
 *
 * Body:
 *   event_id         uuid (required)
 *   idempotency_key  uuid-v4 (required)
 *   items[]          array (min 1)
 *     ticket_tier_id  uuid
 *     quantity        integer >= 1
 *     attendees[]     array — length must equal quantity
 *       name          string (required, non-empty)
 */
const createOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const buyerId = req.user.id;
    const { event_id, idempotency_key, items } = req.body;

    // ── Basic validation ──────────────────────────────────────────────────────
    if (!event_id || !idempotency_key || !Array.isArray(items) || items.length === 0) {
      return fail(res, req, 400, "VALIDATION_ERROR", "Missing required fields: event_id, idempotency_key, items");
    }

    const eventIdNum = parseInt(event_id, 10);
    if (Number.isNaN(eventIdNum) || eventIdNum <= 0) {
      return fail(res, req, 400, "VALIDATION_ERROR", "Invalid event_id");
    }

    for (const item of items) {
      if (!item.ticket_tier_id) {
        return fail(res, req, 400, "VALIDATION_ERROR", "Each item requires ticket_tier_id");
      }
      const ticketTypeIdNum = parseInt(item.ticket_tier_id, 10);
      if (Number.isNaN(ticketTypeIdNum) || ticketTypeIdNum <= 0) {
        return fail(res, req, 400, "VALIDATION_ERROR", `Invalid ticket_tier_id: ${item.ticket_tier_id}`);
      }

      const qty = parseInt(item.quantity, 10);
      if (Number.isNaN(qty) || qty < 1) {
        return fail(res, req, 400, "VALIDATION_ERROR", "Each item requires quantity >= 1");
      }

      if (!Array.isArray(item.attendees) || item.attendees.length !== qty) {
        return fail(res, req, 400, "ATTENDEE_NAME_REQUIRED", "Attendees length must equal quantity");
      }

      for (const attendee of item.attendees) {
        if (!attendee?.name || attendee.name.trim() === "") {
          return fail(res, req, 400, "ATTENDEE_NAME_REQUIRED", "Attendee name is required and must be non-empty");
        }
      }
    }

    await client.query("BEGIN");

    // ── Idempotency check ─────────────────────────────────────────────────────
    // Return existing order if same buyer + same key within 15 minutes
    const idempCheck = await client.query(
      `SELECT
         o.id,
         o.subtotal_amount,
         o.booking_fee_amount,
         o.total_amount,
         o.expires_at,
         o.payment_intent_id,
         (
           SELECT COALESCE(
             json_agg(json_build_object(
               'attendee_name', oi.buyer_name,
               'tier_name', oi.ticket_name,
               'ticket_price', (oi.ticket_price_amount::numeric / 100),
               'booking_fee', (oi.ticket_booking_fee_amount::numeric / 100)
             ) ORDER BY oi.id),
             '[]'::json
           )
           FROM order_items oi
           WHERE oi.order_id = o.id
         ) AS items_json
       FROM orders o
       WHERE o.buyer_user_id = $1
         AND o.idempotency_key = $2
         AND o.created_at > NOW() - INTERVAL '15 minutes'
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [buyerId, idempotency_key]
    );

    if (idempCheck.rowCount > 0) {
      await client.query("ROLLBACK");
      const existing = idempCheck.rows[0];
      return ok(
        res,
        req,
        {
          order: {
            id: existing.id,
            status: "pending",
            total_ticket_amount: Number(existing.subtotal_amount) / 100,
            total_booking_fee: Number(existing.booking_fee_amount) / 100,
            grand_total: Number(existing.total_amount) / 100,
            expires_at: existing.expires_at,
            payment_intent_ref: existing.payment_intent_id,
            items: existing.items_json || [],
          },
        },
        200
      );
    }

    // ── Per-ticket type validation & fee calculation ─────────────────────────
    let totalTicketPence = 0;
    let totalBookingFeePence = 0;
    const resolvedItems = [];

    for (const item of items) {
      const ticketTypeIdNum = parseInt(item.ticket_tier_id, 10);
      const qty = parseInt(item.quantity, 10);
      const attendees = item.attendees.map((a) => a.name.trim());

      const tierResult = await client.query(
        `SELECT
           id, name, price_amount, booking_fee_amount, capacity_total, qty_sold
         FROM ticket_types
         WHERE id = $1 AND event_id = $2
         FOR UPDATE`,
        [ticketTypeIdNum, eventIdNum]
      );

      if (tierResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return fail(res, req, 400, "VALIDATION_ERROR", `Ticket type ${item.ticket_tier_id} not found for this event`);
      }

      const tier = tierResult.rows[0];

      const reservedResult = await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS reserved_qty
         FROM inventory_reservations
         WHERE ticket_type_id = $1
           AND status = 'active'
           AND expires_at > NOW()`,
        [tier.id]
      );

      const reservedQty = reservedResult.rows[0]?.reserved_qty ?? 0;
      const capacity = tier.capacity_total ?? 999999;
      const remaining = capacity - tier.qty_sold - reservedQty;

      if (remaining < qty) {
        await client.query("ROLLBACK");
        return fail(
          res,
          req,
          409,
          "QUANTITY_EXCEEDED",
          `Not enough tickets remaining for tier "${tier.name}". Available: ${remaining}`
        );
      }

      totalTicketPence += tier.price_amount * qty;
      totalBookingFeePence += tier.booking_fee_amount * qty;

      resolvedItems.push({
        ticket_type_id: tier.id,
        tier_name: tier.name,
        ticket_price_amount: tier.price_amount,
        ticket_booking_fee_amount: tier.booking_fee_amount,
        quantity: qty,
        attendees,
      });
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const paymentIntentRef = "stub_pi_abc123";
    const orderNumber = `EVT-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    const orderInsert = await client.query(
      `INSERT INTO orders (
         order_number,
         buyer_user_id,
         event_id,
         subtotal_amount,
         booking_fee_amount,
         total_amount,
         currency,
         status,
         payment_status,
         payment_intent_id,
         payment_provider,
         expires_at,
         idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,$6,'GBP','payment_pending','unpaid',$7,'stub',$8,$9)
       RETURNING id`,
      [
        orderNumber,
        buyerId,
        eventIdNum,
        totalTicketPence,
        totalBookingFeePence,
        totalTicketPence + totalBookingFeePence,
        paymentIntentRef,
        expiresAt,
        idempotency_key,
      ]
    );

    const orderId = orderInsert.rows[0].id;

    // Reserve inventory for active pending order
    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO inventory_reservations (order_id, ticket_type_id, quantity, expires_at, status)
         VALUES ($1,$2,$3,$4,'active')`,
        [orderId, item.ticket_type_id, item.quantity, expiresAt]
      );
    }

    const responseItems = [];
    const buyerEmail = req.user.email || null;

    // Insert order items: one row per attendee ticket
    for (const item of resolvedItems) {
      for (const attendeeName of item.attendees) {
        await client.query(
          `INSERT INTO order_items (
             order_id,
             ticket_type_id,
             ticket_name,
             ticket_price_amount,
             ticket_booking_fee_amount,
             quantity,
             subtotal_amount,
             buyer_name,
             buyer_email
           ) VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8)`,
          [
            orderId,
            item.ticket_type_id,
            item.tier_name,
            item.ticket_price_amount,
            item.ticket_booking_fee_amount,
            item.ticket_price_amount + item.ticket_booking_fee_amount,
            attendeeName,
            buyerEmail,
          ]
        );

        responseItems.push({
          attendee_name: attendeeName,
          tier_name: item.tier_name,
          ticket_price: Number(item.ticket_price_amount) / 100,
          booking_fee: Number(item.ticket_booking_fee_amount) / 100,
        });
      }
    }

    await client.query("COMMIT");

    return ok(
      res,
      req,
      {
        order: {
          id: orderId,
          status: "pending",
          total_ticket_amount: totalTicketPence / 100,
          total_booking_fee: totalBookingFeePence / 100,
          grand_total: (totalTicketPence + totalBookingFeePence) / 100,
          expires_at: expiresAt,
          payment_intent_ref: paymentIntentRef,
          items: responseItems,
        },
      },
      201
    );

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("createOrder error:", err);
    return res.status(500).json({ error: true, message: err.message || "Internal server error", data: null });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// SERVICE 2 — POST /orders/:id/confirm
// ─────────────────────────────────────────────

/**
 * Confirms payment success or failure.
 * Auth: System call (PaymentService stub in Phase 1 / live webhook in production).
 *
 * Body:
 *   payment_ref     string  (must match order's payment_intent_ref)
 *   payment_status  "success" | "failure"
 *
 * On success:
 *   - Order → completed
 *   - QR codes generated per order_item
 *   - escrow_ledger credit entry (total_ticket_amount)
 *   - operating_ledger credit entry (total_booking_fee)
 *   - ticket_tier.quantity_sold incremented
 *   - audit_ledger entries written
 *   - Confirmation email queued
 */
const confirmOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = parseInt(req.params.id, 10);
    if (Number.isNaN(orderId) || orderId <= 0) {
      return fail(res, req, 400, "VALIDATION_ERROR", "Invalid order id");
    }
    const { payment_ref, payment_status } = req.body;

    // ── payment_status = failure → short circuit ──────────────────────────────
    if (payment_status === "failure") {
      await client.query("BEGIN");
      // Release inventory reservations for this pending order
      await client.query(
        `UPDATE inventory_reservations
         SET status = 'cancelled'
         WHERE order_id = $1`,
        [orderId]
      );
      await client.query(
        `UPDATE orders
         SET payment_status = 'failed'
         WHERE id = $1`,
        [orderId]
      );
      await client.query("COMMIT");

      return fail(res, req, 400, "PAYMENT_FAILED", "Payment failed. Order remains pending. No escrow entry created.");
    }

    if (payment_status !== "success") {
      return fail(res, req, 400, "VALIDATION_ERROR", "payment_status must be 'success' or 'failure'");
    }

    await client.query("BEGIN");

    // ── Fetch order ───────────────────────────────────────────────────────────
    const orderResult = await client.query(
      `SELECT
         o.*,
         e.territory_id,
         e.promoter_id,
         e.guru_id,
         e.network_manager_id,
         e.id AS event_id
       FROM orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return fail(res, req, 404, "ORDER_NOT_FOUND", "Order not found");
    }

    const order = orderResult.rows[0];

    if (order.payment_intent_id !== payment_ref) {
      await client.query("ROLLBACK");
      return fail(res, req, 400, "VALIDATION_ERROR", "payment_ref does not match order");
    }

    const alreadyConfirmed =
      order.payment_status === "paid" || order.payment_status === "PAID" || order.status === "confirmed" || order.confirmed_at;

    if (alreadyConfirmed) {
      await client.query("ROLLBACK");
      return fail(res, req, 400, "ALREADY_COMPLETED", "Order already confirmed");
    }

    // ── Update order status ───────────────────────────────────────────────────
    await client.query(
      "UPDATE orders SET status = 'confirmed', payment_status = 'paid', confirmed_at = NOW() WHERE id = $1",
      [orderId]
    );

    // ── Fetch order items (one row per attendee ticket) ─────────────────────
    const itemsResult = await client.query(
      `SELECT
         oi.id AS order_item_id,
         oi.ticket_type_id,
         oi.ticket_name AS tier_name,
         oi.ticket_price_amount,
         oi.ticket_booking_fee_amount,
         oi.quantity,
         oi.buyer_name AS attendee_name,
         oi.buyer_email
       FROM order_items oi
       WHERE oi.order_id = $1
       ORDER BY oi.id`,
      [orderId]
    );

    const responseItems = [];
    const qtyByTicketType = {}; // ticket_type_id -> quantity

    function generateTicketCode() {
      return "TKT-" + crypto.randomBytes(6).toString("hex").toUpperCase();
    }

    // Mint tickets + compute/store deterministic QR hash in tickets.qr_code_data
    for (const item of itemsResult.rows) {
      const qty = item.quantity || 1;
      qtyByTicketType[item.ticket_type_id] = (qtyByTicketType[item.ticket_type_id] || 0) + qty;

      for (let i = 0; i < qty; i++) {
        const ticketInsert = await client.query(
          `INSERT INTO tickets (
             order_item_id,
             order_id,
             event_id,
             ticket_type_id,
             ticket_code,
             buyer_name,
             buyer_email,
             status,
             user_id,
             issued_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,NOW())
           RETURNING id`,
          [
            item.order_item_id,
            orderId,
            order.event_id,
            item.ticket_type_id,
            generateTicketCode(),
            item.attendee_name,
            item.buyer_email || "",
            order.buyer_user_id,
          ]
        );

        const ticketId = ticketInsert.rows[0].id;
        const { qrPayload, qrCodeHash } = buildQR({
          ticketItemId: ticketId,
          orderId: orderId,
          eventId: order.event_id,
          buyerId: order.buyer_user_id,
          attendeeName: item.attendee_name,
          tierName: item.tier_name,
        });

        await client.query(
          `UPDATE tickets
           SET qr_code_data = $1
           WHERE id = $2`,
          [qrCodeHash, ticketId]
        );

        // Document route: GET /api/buyer/tickets/:itemId/qr
        const qrCodeUrl = `/api/buyer/tickets/${ticketId}/qr`;
        responseItems.push({
          id: ticketId,
          attendee_name: item.attendee_name,
          tier_name: item.tier_name,
          ticket_price: Number(item.ticket_price_amount) / 100,
          booking_fee: Number(item.ticket_booking_fee_amount) / 100,
          qr_code_hash: qrCodeHash,
          qr_code_url: qrCodeUrl,
        });
      }
    }

    // ── Consume reservations + increment inventory sold ──────────────────────
    await client.query(
      `UPDATE inventory_reservations
       SET status = 'consumed'
       WHERE order_id = $1 AND status = 'active'`,
      [orderId]
    );

    for (const [ticketTypeId, qty] of Object.entries(qtyByTicketType)) {
      await client.query(
        `UPDATE ticket_types
         SET qty_sold = qty_sold + $1
         WHERE id = $2`,
        [qty, ticketTypeId]
      );
    }

    await client.query(
      `UPDATE events
       SET tickets_sold = (
         SELECT COUNT(*) FROM tickets
         WHERE event_id = $1 AND status = 'ACTIVE'
       )
       WHERE id = $1`,
      [order.event_id]
    );

    // ── Ledger + projected credit (reuses existing services) ────────────────
    await receiveTicketPayment({
      territory_id: order.territory_id || 1,
      escrow_amount_pence: Number(order.subtotal_amount),
      booking_fee_pence: Number(order.booking_fee_amount),
      buyer_id: order.buyer_user_id,
      order_id: orderId,
      event_id: order.event_id,
    });

    // Allocate projected credit per tier label derived from ticket price.
    const qtyByTierLabel = {}; // tier_label -> quantity
    for (const item of itemsResult.rows) {
      const tierPricePounds = Number(item.ticket_price_amount) / 100;
      const { tier_label } = resolveTier(tierPricePounds);
      qtyByTierLabel[tier_label] = (qtyByTierLabel[tier_label] || 0) + (item.quantity || 1);
    }

    for (const [tierLabel, qty] of Object.entries(qtyByTierLabel)) {
      await allocateCredit({
        event_id: order.event_id,
        tier_label: Number(tierLabel),
        quantity: qty,
        promoter_id: order.promoter_id,
        guru_id: order.guru_id,
        network_manager_id: order.network_manager_id,
        territory_id: order.territory_id || 1,
        order_id: orderId,
      });
    }

    await client.query("COMMIT");

    return ok(res, req, {
      order: {
        id: order.id,
        status: "completed",
        items: responseItems
      },
      escrow_entry_created: true,
      confirmation_email_sent: false
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("confirmOrder error:", err);
    return res.status(500).json({ error: true, message: err.message || "Internal server error", data: null });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// SERVICE 3 — GET /buyer/tickets
// ─────────────────────────────────────────────

/**
 * Returns all tickets for the authenticated buyer, grouped by event.
 * Auth: required — role: buyer
 *
 * Query params:
 *   status  active | used | cancelled  (optional)
 *   page    integer (default 1)
 *   limit   integer (default 20)
 */
const getBuyerTickets = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const params = [buyerId];
    let paramIdx = 2;

    // Module 3 status values -> DB ticket status values
    let ticketStatusFilter = "";
    if (status) {
      if (status === "active") ticketStatusFilter = "AND t.status = 'ACTIVE'";
      else if (status === "used") ticketStatusFilter = "AND t.status = 'USED'";
      else if (status === "cancelled") ticketStatusFilter = "AND t.status IN ('CANCELLED','VOID')";
      else return fail(res, req, 400, "VALIDATION_ERROR", "Invalid status filter");
    }

    const query = `
      SELECT
        e.id AS event_id,
        e.title AS event_title,
        e.start_at AS event_date,
        TO_CHAR(e.start_at, 'HH24:MI') AS event_start_time,
        e.venue_name,
        e.status AS event_status,
        o.id AS order_id,
        o.created_at AS order_created_at,
        (o.subtotal_amount::numeric / 100) AS total_ticket_amount,
        (o.booking_fee_amount::numeric / 100) AS total_booking_fee,
        (o.total_amount::numeric / 100) AS grand_total,
        t.id AS ticket_id,
        t.buyer_name AS attendee_name,
        oi.ticket_name AS tier_name,
        (oi.ticket_price_amount::numeric / 100) AS ticket_price,
        (oi.ticket_booking_fee_amount::numeric / 100) AS booking_fee,
        t.status AS ticket_status
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      JOIN events e ON e.id = o.event_id
      JOIN order_items oi ON oi.id = t.order_item_id
      WHERE o.buyer_user_id = $1
        AND o.payment_status = 'paid'
        ${ticketStatusFilter}
      ORDER BY e.start_at DESC, o.id DESC, t.id DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limitNum, offset);

    const result = await pool.query(query, params);

    const eventMap = new Map(); // key = event_id:order_id
    for (const row of result.rows) {
      const key = `${row.event_id}:${row.order_id}`;
      if (!eventMap.has(key)) {
        eventMap.set(key, {
          event: {
            id: row.event_id,
            title: row.event_title,
            date: row.event_date ? String(row.event_date) : null,
            start_time: row.event_start_time,
            venue_name: row.venue_name,
            status: row.event_status,
          },
          order: {
            id: row.order_id,
            created_at: row.order_created_at,
            total_ticket_amount: Number(row.total_ticket_amount),
            total_booking_fee: Number(row.total_booking_fee),
            grand_total: Number(row.grand_total),
          },
          tickets: [],
        });
      }

      const apiTicketStatus =
        row.ticket_status === "ACTIVE"
          ? "active"
          : row.ticket_status === "USED"
            ? "used"
            : row.ticket_status === "REFUNDED"
              ? "refunded"
              : "cancelled";

      eventMap.get(key).tickets.push({
        id: row.ticket_id,
        attendee_name: row.attendee_name,
        tier_name: row.tier_name,
        ticket_price: Number(row.ticket_price),
        booking_fee: Number(row.booking_fee),
        status: apiTicketStatus,
        // Document route: GET /api/buyer/tickets/:itemId/qr
        qr_code_url: `/api/buyer/tickets/${row.ticket_id}/qr`,
      });
    }

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      JOIN events e ON e.id = o.event_id
      JOIN order_items oi ON oi.id = t.order_item_id
      WHERE o.buyer_user_id = $1
        AND o.payment_status = 'paid'
        ${ticketStatusFilter}
    `;
    const countResult = await pool.query(countQuery, [buyerId]);
    const total = parseInt(countResult.rows[0].total, 10);

    return ok(res, req, {
      data: Array.from(eventMap.values()),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum)
      }
    });

  } catch (err) {
    console.error("getBuyerTickets error:", err);
    return res.status(500).json({ error: true, message: err.message || "Internal server error", data: null });
  }
};

// ─────────────────────────────────────────────
// SERVICE 4 — GET /buyer/tickets/:itemId/qr
// ─────────────────────────────────────────────

/**
 * Returns QR code data and signed hash for a specific ticket item.
 * Auth: required — role: buyer. Must own the ticket item.
 *
 * Response:
 *   ticket_item_id   uuid
 *   qr_code_hash     string (sha256 signed hash)
 *   qr_payload       { ticket_item_id, order_id, event_id, buyer_id, attendee_name, tier_name }
 *   qr_image_base64  string (data:image/png;base64,...)
 *   status           active | used | refunded
 */
const getTicketQR = async (req, res) => {
  try {
    const { itemId } = req.params;
    const buyerId = req.user.id;
    const ticketId = parseInt(itemId, 10);
    if (Number.isNaN(ticketId) || ticketId <= 0) {
      return fail(res, req, 404, "TICKET_NOT_FOUND", "Ticket does not exist or does not belong to this buyer");
    }

    const result = await pool.query(
      `SELECT
         t.id,
         t.buyer_name,
         t.qr_code_data,
         t.status AS ticket_status,
         t.event_id,
         t.order_id,
         o.buyer_user_id,
         oi.ticket_name AS tier_name
       FROM tickets t
       JOIN orders o ON o.id = t.order_id
       JOIN order_items oi ON oi.id = t.order_item_id
       WHERE t.id = $1`,
      [ticketId]
    );

    if (result.rowCount === 0) {
      return fail(res, req, 404, "TICKET_NOT_FOUND",
        "Ticket does not exist or does not belong to this buyer");
    }

    const item = result.rows[0];

    if (item.buyer_user_id !== buyerId) {
      return fail(res, req, 404, "TICKET_NOT_FOUND",
        "Ticket does not exist or does not belong to this buyer");
    }

    const qrPayload = {
      ticket_item_id: item.id,
      order_id: item.order_id,
      event_id: item.event_id,
      buyer_id: buyerId,
      attendee_name: item.buyer_name,
      tier_name: item.tier_name,
    };

    // Use stored qr_code_data if present, otherwise re-derive
    const qrCodeHash = item.qr_code_data || signQRHash(qrPayload);

    // Generate QR image as base64 PNG using the qrcode package
    let qrImageBase64 = null;
    try {
      const QRCode = require("qrcode");
      const dataUrl = await QRCode.toDataURL(qrCodeHash, { type: "image/png", width: 300 });
      qrImageBase64 = dataUrl; // already "data:image/png;base64,..."
    } catch (_qrErr) {
      // qrcode package may not be installed in all envs — return null gracefully
      console.warn("getTicketQR: qrcode package unavailable:", _qrErr.message);
    }

    return ok(res, req, {
      ticket_item_id: item.id,
      qr_code_hash: qrCodeHash,
      qr_payload: qrPayload,
      qr_image_base64: qrImageBase64,
      status:
        item.ticket_status === "ACTIVE"
          ? "active"
          : item.ticket_status === "USED"
            ? "used"
            : item.ticket_status === "REFUNDED"
              ? "refunded"
              : "refunded",
    });

  } catch (err) {
    console.error("getTicketQR error:", err);
    return res.status(500).json({ error: true, message: err.message || "Internal server error", data: null });
  }
};

// ─────────────────────────────────────────────
// SERVICE 5 — POST /events/:id/scan
// ─────────────────────────────────────────────

/**
 * Validates a QR code hash at event entry. Marks ticket as used if valid.
 * Auth: required — role: promoter or admin
 *
 * Body:
 *   qr_code_hash  string (scanned from QR code)
 *
 * Response is ALWAYS 200.
 * Use valid: false to handle rejection on client (never 4xx for invalid scans).
 *
 * Rejection reasons: ALREADY_USED | INVALID_HASH | WRONG_EVENT
 */
const scanTicket = async (req, res) => {
  const client = await pool.connect();
  try {
    const eventId = req.params.id;
    const { qr_code_hash } = req.body;

    if (!qr_code_hash) {
      // Not a scan error — this is a bad API call; still return 200 with invalid
      return ok(res, req, {
        valid: false,
        reason: "INVALID_HASH",
        message: "No QR code hash provided"
      });
    }

    await client.query("BEGIN");

    const itemResult = await client.query(
      `SELECT
         t.id,
         t.buyer_name,
         t.status AS ticket_status,
         t.event_id,
         t.order_id,
         oi.ticket_name AS tier_name,
         t.qr_code_data
       FROM tickets t
       JOIN order_items oi ON oi.id = t.order_item_id
       WHERE t.qr_code_data = $1
       FOR UPDATE`,
      [qr_code_hash]
    );

    if (itemResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return ok(res, req, {
        valid: false,
        reason: "INVALID_HASH",
        message: "QR code is invalid or unrecognised"
      });
    }

    const item = itemResult.rows[0];

    // ── WRONG_EVENT ───────────────────────────────────────────────────────────
    if (String(item.event_id) !== String(eventId)) {
      await client.query("ROLLBACK");
      return ok(res, req, {
        valid: false,
        reason: "WRONG_EVENT",
        message: "This ticket is for a different event"
      });
    }

    // ── ALREADY_USED ──────────────────────────────────────────────────────────
    if (item.ticket_status === "USED") {
      await client.query("ROLLBACK");
      return ok(res, req, {
        valid: false,
        reason: "ALREADY_USED",
        message: "This ticket has already been used"
      });
    }

    // ── Mark as used ──────────────────────────────────────────────────────────
    await client.query(
      `UPDATE tickets
       SET status = 'USED',
           used_at = NOW(),
           used_by_user_id = $2,
           checked_in_at = NOW(),
           checked_in_by = $2
       WHERE id = $1`,
      [item.id, req.user.id]
    );

    // Record check-in + audit + validation log (existing ticketing services)
    await client.query(
      `INSERT INTO checkins (ticket_id, event_id, promoter_user_id, scanned_at)
       VALUES ($1,$2,$3,NOW())`,
      [item.id, item.event_id, req.user.id]
    );

    await logTicketAudit(req.user.id, item.id, item.event_id, "CHECKED_IN", "ACTIVE", "USED", {
      qr_code_hash,
      ticket_item_id: item.id,
      order_id: item.order_id,
    });

    const sha256 = crypto.createHash("sha256").update(String(qr_code_hash)).digest("hex");
    await logValidationAttempt({
      eventId: item.event_id,
      ticketId: item.id,
      qrHash: sha256,
      resultStatus: "VALID",
      scannedByUserId: req.user.id,
      metadata: {
        ticket_item_id: item.id,
        order_id: item.order_id,
        attendee_name: item.buyer_name,
      },
    });

    await client.query("COMMIT");

    return ok(res, req, {
      valid: true,
      ticket: {
        id: item.id,
        attendee_name: item.buyer_name,
        tier_name: item.tier_name,
        status: "used"
      }
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("scanTicket error:", err);
    // Per spec: always 200
    return res.status(200).json({
      error: false,
      data: {
        valid: false,
        reason: "INVALID_HASH",
        message: "An internal error occurred while validating the ticket"
      }
    });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// EXPORTS — only the 5 endpoints from Module 3
// ─────────────────────────────────────────────
module.exports = {
  createOrder,   // POST /orders
  confirmOrder,  // POST /orders/:id/confirm
  getBuyerTickets, // GET /buyer/tickets
  getTicketQR,   // GET /buyer/tickets/:itemId/qr
  scanTicket     // POST /events/:id/scan
};