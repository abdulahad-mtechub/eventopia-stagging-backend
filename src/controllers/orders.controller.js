const pool = require("../db");
const { ok, fail } = require("../utils/standardResponse");
const crypto = require("crypto");

function generateTicketCode() {
  return "TKT-" + crypto.randomBytes(6).toString('hex').toUpperCase();
}

function validateOrderId(orderId) {
  const id = parseInt(orderId, 10);
  if (isNaN(id) || id <= 0) {
    const error = new Error("Invalid order ID");
    error.status = 404;
    throw error;
  }
  return id;
}

function generateOrderNumber(orderId) {
  const year = new Date().getFullYear();
  const paddedId = String(orderId).padStart(6, '0');
  return "EVT-" + year + "-" + paddedId;
}

// const createOrder = async (req, res) => {
//   try {
//     const { eventId } = req.params;
//     const { idempotencyKey, items, buyerName, buyerEmail } = req.body;


//     if (!idempotencyKey) {
//       return fail(res, req, 400, "VALIDATION_ERROR", "Idempotency key required");
//     }

//     if (!Array.isArray(items) || items.length === 0) {
//       return fail(res, req, 400, "VALIDATION_ERROR", "Items required");
//     }

//     const eventIdNum = parseInt(eventId, 10);
//     const buyerUserId = req.user.id;


//     const client = await pool.connect();
//     try {
//       await client.query("BEGIN");

//       const eventResult = await client.query(
//         "SELECT id, status FROM events WHERE id = $1",
//         [eventIdNum]
//       );

//       if (eventResult.rowCount === 0) {
//         return fail(res, req, 404, "EVENT_NOT_FOUND", "Event not found");
//       }

//       const event = eventResult.rows[0];
//       if (event.status !== 'published') {
//         return fail(res, req, 400, "EVENT_NOT_PUBLISHED", "Event not published");
//       }

//       const ticketTypeIds = items.map(item => parseInt(item.ticketTypeId, 10));
//       const ticketTypesResult = await client.query(
//         "SELECT * FROM ticket_types WHERE event_id = $1 AND id = ANY($2::bigint[]) FOR UPDATE",
//         [eventIdNum, ticketTypeIds]
//       );

//       const ticketTypes = ticketTypesResult.rows;
//       let totalAmount = 0;

//       // Check if all ticket types were found
//       if (ticketTypes.length !== items.length) {
//         return fail(res, req, 404, "TICKET_TYPE_NOT_FOUND", "One or more ticket types not found for this event");
//       }

//       for (const item of items) {
//         const ticketTypeIdNum = parseInt(item.ticketTypeId, 10);
//         const ticketType = ticketTypes.find(tt => tt.id === ticketTypeIdNum);
//         if (!ticketType) {
//           return fail(res, req, 404, "TICKET_TYPE_NOT_FOUND", "Ticket type not found: " + item.ticketTypeId);
//         }

//         if (ticketType.status !== 'active') {
//           return fail(res, req, 400, "TICKET_TYPE_NOT_ACTIVE", "Ticket type not active");
//         }

//         const lineTotal = item.quantity * (ticketType.price_amount + ticketType.booking_fee_amount);
//         totalAmount += lineTotal;
//       }

//       const orderResult = await client.query(
//         `INSERT INTO orders (
//           buyer_user_id, event_id, total_amount, currency,
//           status, payment_status, idempotency_key, expires_at
//         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//         RETURNING id, status, total_amount, currency, expires_at`,
//         [buyerUserId, eventIdNum, totalAmount, 'GBP', 'payment_pending', 'unpaid', idempotencyKey, new Date(Date.now() + 30 * 60 * 1000)]
//       );

//       const order = orderResult.rows[0];


//       for (const item of items) {
//         const ticketTypeIdNum = parseInt(item.ticketTypeId, 10);
//         const ticketType = ticketTypes.find(tt => tt.id === ticketTypeIdNum);
//         const lineTotal = item.quantity * (ticketType.price_amount + ticketType.booking_fee_amount);

//         await client.query(
//           `INSERT INTO order_items (
//             order_id, ticket_type_id, ticket_name, ticket_price_amount,
//             quantity, subtotal_amount, buyer_name, buyer_email
//           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
//           [order.id, ticketType.id, ticketType.name, ticketType.price_amount, item.quantity, lineTotal, buyerName || req.user.name, buyerEmail || req.user.email]
//         );

//         await client.query(
//           "UPDATE ticket_types SET qty_sold = qty_sold + $1 WHERE id = $2",
//           [item.quantity, ticketType.id]
//         );
//       }

//       await client.query("COMMIT");

//       return ok(res, req, {
//         orderId: order.id,
//         status: order.status,
//         totalAmount: order.total_amount,
//         currency: order.currency,
//         expiresAt: order.expires_at
//       });
//     } catch (err) {
//       await client.query("ROLLBACK");
//       throw err;
//     } finally {
//       client.release();
//     }
//   } catch (err) {
//     return res.status(500).json({
//       error: true,
//       message: err.message || "Internal server error",
//       data: null
//     });
//   }
// };


const createOrder = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { idempotencyKey, items } = req.body;

    console.log("➡️ createOrder called", {
      eventId,
      body: req.body,
      userId: req.user?.id,
    });

    if (!idempotencyKey) {
      return fail(res, req, 400, "VALIDATION_ERROR", "Idempotency key required");
    }

    if (!Array.isArray(items) || items.length === 0) {
      return fail(res, req, 400, "VALIDATION_ERROR", "Items required");
    }

    const eventIdNum = Number(eventId);
    if (!Number.isInteger(eventIdNum)) {
      return fail(res, req, 400, "VALIDATION_ERROR", "Invalid eventId");
    }

    if (!req.user?.id || !Number.isInteger(Number(req.user.id))) {
      return fail(res, req, 401, "UNAUTHORIZED", "Invalid user");
    }

    const buyerUserId = Number(req.user.id);

    // Validate items early
    for (const item of items) {
      if (!Number.isInteger(Number(item.ticketTypeId))) {
        return fail(res, req, 400, "VALIDATION_ERROR", "Invalid ticketTypeId");
      }
      if (!Number.isInteger(Number(item.quantity)) || item.quantity <= 0) {
        return fail(res, req, 400, "VALIDATION_ERROR", "Invalid quantity");
      }
    }

    const ticketTypeIds = items.map(item => Number(item.ticketTypeId));

    console.log("🎟 ticketTypeIds:", ticketTypeIds);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 🔹 Fetch event
      const eventResult = await client.query(
        "SELECT id, status, visibility_mode FROM events WHERE id = $1",
        [eventIdNum]
      );

      if (eventResult.rowCount === 0) {
        return fail(res, req, 404, "EVENT_NOT_FOUND", "Event not found");
      }

      const event = eventResult.rows[0];

      if (event.status !== "published") {
        return fail(res, req, 400, "EVENT_NOT_PUBLISHED", "Event not published");
      }

      // 🔹 Check access grant for private_link events or hidden ticket types
      // First check if any ticket types are hidden
      const hiddenTicketTypesResult = await client.query(
        `SELECT COUNT(*) as hidden_count
         FROM ticket_types
         WHERE event_id = $1 AND visibility = 'hidden' AND id = ANY($2::bigint[])`,
        [eventIdNum, ticketTypeIds]
      );

      const hasHiddenTickets = parseInt(hiddenTicketTypesResult.rows[0].hidden_count) > 0;
      const isPrivateLink = event.visibility_mode === 'private_link';

      if (hasHiddenTickets || isPrivateLink) {
        // Require access grant
        const accessGrant = req.cookies?.event_access_grant;
        const { hasEventAccess } = require('../services/access.service');

        if (!accessGrant || !hasEventAccess(accessGrant, eventIdNum, buyerUserId)) {
          return fail(
            res,
            req,
            403,
            "ACCESS_DENIED",
            "This event requires special access. Please access through the private link."
          );
        }
      }

      // 🔹 Fetch ticket types WITH event validation
      const ticketTypesResult = await client.query(
        `
        SELECT *
        FROM ticket_types
        WHERE id = ANY($1::bigint[])
          AND event_id = $2
        FOR UPDATE
        `,
        [ticketTypeIds, eventIdNum]
      );

      console.log("🎫 ticketTypes fetched:", ticketTypesResult.rows);

      if (ticketTypesResult.rowCount !== ticketTypeIds.length) {
        return fail(
          res,
          req,
          404,
          "TICKET_TYPE_NOT_FOUND",
          "Ticket type not found for this event"
        );
      }

      const ticketTypeMap = new Map(
        ticketTypesResult.rows.map(tt => [Number(tt.id), tt])
      );

      let totalAmount = 0;

      for (const item of items) {
        const ticketType = ticketTypeMap.get(Number(item.ticketTypeId));

        if (ticketType.status !== "active") {
          return fail(
            res,
            req,
            400,
            "TICKET_TYPE_NOT_ACTIVE",
            "Ticket type not active"
          );
        }

        const lineTotal =
          Number(item.quantity) *
          (Number(ticketType.price_amount) +
            Number(ticketType.booking_fee_amount));

        totalAmount += lineTotal;
      }

      console.log("💰 totalAmount:", totalAmount);

      // 🔹 Create order
      // const orderResult = await client.query(
      //   `
      //   INSERT INTO orders (
      //     buyer_user_id,
      //     event_id,
      //     total_amount,
      //     currency,
      //     status,
      //     payment_status,
      //     idempotency_key,
      //     expires_at
      //   )
      //   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      //   RETURNING id, status, total_amount, currency, expires_at
      //   `,
      //   [
      //     buyerUserId,
      //     eventIdNum,
      //     totalAmount,
      //     "GBP",
      //     "payment_pending",
      //     "unpaid",
      //     idempotencyKey,
      //     new Date(Date.now() + 30 * 60 * 1000),
      //   ]
      // );

      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;


      const orderResult = await client.query(
        `
  INSERT INTO orders (
    order_number,
    buyer_user_id,
    event_id,
    total_amount,
    currency,
    status,
    payment_status,
    idempotency_key,
    expires_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  RETURNING id, order_number, status, total_amount, currency, expires_at
  `,
        [
          orderNumber,
          buyerUserId,
          eventIdNum,
          totalAmount,
          "GBP",
          "PENDING",
          "unpaid",
          idempotencyKey,
          new Date(Date.now() + 30 * 60 * 1000),
        ]
      );


      const order = orderResult.rows[0];

      // 🔹 Create order items + reservations (NOT qty_sold)
      for (const item of items) {
        const ticketType = ticketTypeMap.get(Number(item.ticketTypeId));

        const lineTotal =
          Number(item.quantity) *
          (Number(ticketType.price_amount) +
            Number(ticketType.booking_fee_amount));

        const orderItemResult = await client.query(
          `
          INSERT INTO order_items (
            order_id,
            ticket_type_id,
            ticket_name,
            ticket_price_amount,
            quantity,
            subtotal_amount,
            buyer_name,
            buyer_email
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
          `,
          [
            order.id,
            ticketType.id,
            ticketType.name,
            ticketType.price_amount,
            item.quantity,
            lineTotal,
            item.buyerName || null,
            item.buyerEmail || null,
          ]
        );

        // Create inventory reservation (DO NOT increment qty_sold yet)
        await client.query(
          `
          INSERT INTO inventory_reservations (
            order_id,
            ticket_type_id,
            quantity,
            expires_at
          )
          VALUES ($1, $2, $3, $4)
          `,
          [
            order.id,
            ticketType.id,
            item.quantity,
            order.expires_at
          ]
        );
      }

      // TODO: Create payment intent with Stripe
      // const paymentIntent = await stripe.paymentIntents.create({
      //   amount: totalAmount,
      //   currency: 'gbp',
      //   metadata: { orderId: order.id }
      // });
      //
      // await client.query(
      //   'UPDATE orders SET payment_intent_id = $1 WHERE id = $2',
      //   [paymentIntent.id, order.id]
      // );

      await client.query("COMMIT");

      console.log("✅ Order created:", order);

      return ok(res, req, {
        orderId: order.id,
        status: order.status,
        totalAmount: order.total_amount,
        currency: order.currency,
        expiresAt: order.expires_at,
        // paymentClientSecret: paymentIntent.client_secret, // TODO: Uncomment when payment service is added
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ createOrder error:", err);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || "Internal server error",
      data: null,
    });
  }
};


const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderIdNum = validateOrderId(orderId);

    const orderQuery = `
      SELECT
        o.*,
        e.title as "eventTitle",
        e.start_at as "eventStartAt",
        e.format as "eventFormat",
        e.venue_name as "venueName",
        e.city_display as "cityDisplay",
        e.cover_image_url as "coverImageUrl"
      FROM orders o
      LEFT JOIN events e ON e.id = o.event_id
      WHERE o.id = $1
    `;

    const result = await pool.query(orderQuery, [orderIdNum]);

    if (result.rowCount === 0) {
      return fail(res, req, 404, "ORDER_NOT_FOUND", "Order not found");
    }

    const order = result.rows[0];

    if (order.buyer_user_id !== req.user.id) {
      return fail(res, req, 403, "FORBIDDEN", "No permission");
    }

    const itemsQuery = `
      SELECT
        oi.id as "itemId",
        oi.quantity,
        oi.subtotal_amount,
        tt.name as "ticketTypeName",
        t.id as "ticketId",
        t.status as "ticketStatus",
        t.used_at as "usedAt"
      FROM order_items oi
      LEFT JOIN ticket_types tt ON tt.id = oi.ticket_type_id
      LEFT JOIN tickets t ON t.order_item_id = oi.id
      WHERE oi.order_id = $1
      ORDER BY tt.name
    `;

    const itemsResult = await pool.query(itemsQuery, [orderIdNum]);

    const orderItems = itemsResult.rows.map(row => ({
      itemId: row.itemId,
      quantity: row.quantity,
      subtotalAmount: row.subtotal_amount,
      ticketTypeName: row.ticketTypeName,
      ticketId: row.ticketId,
      ticketStatus: row.ticketStatus,
      usedAt: row.usedAt
    }));

    return ok(res, req, {
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        totalAmount: order.total_amount,
        currency: order.currency,
        createdAt: order.created_at,
        eventSnapshot: {
          title: order.eventTitle,
          startAt: order.eventStartAt,
          format: order.eventFormat,
          venueName: order.venueName,
          cityDisplay: order.cityDisplay,
          coverImageUrl: order.coverImageUrl
        },
        items: orderItems
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || "Internal server error",
      data: null
    });
  }
};

const getMyTickets = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, from, to } = req.query;
    const buyerUserId = req.user.id;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20));
    const offset = (pageNum - 1) * pageSizeNum;

    const conditions = ["t.user_id = $1"];
    const params = [buyerUserId];
    let paramCount = 2;

    if (status) {
      conditions.push(`t.status = $${paramCount++}`);
      params.push(status.toUpperCase());
    }

    if (from) {
      conditions.push(`e.start_at >= $${paramCount++}`);
      params.push(new Date(from));
    }

    if (to) {
      conditions.push(`e.start_at <= $${paramCount++}`);
      params.push(new Date(to));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        t.id as "ticketId",
        t.status,
        t.ticket_code,
        t.issued_at,
        t.used_at,
        t.refunded_at,
        t.cancelled_at,
        tt.name as "ticketTypeName",
        e.id as "eventId",
        e.title as "eventTitle",
        e.start_at as "eventStartAt",
        e.format as "eventFormat",
        e.venue_name as "venueName",
        e.city_display as "cityDisplay",
        e.cover_image_url as "coverImageUrl"
      FROM tickets t
      LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN events e ON e.id = t.event_id
      ${whereClause}
      ORDER BY e.start_at DESC, t.id DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;

    params.push(pageSizeNum, offset);

    const result = await pool.query(query, params);

    const tickets = result.rows.map(row => ({
      ticketId: row.ticketId,
      status: row.status,
      ticketCode: row.ticket_code,
      issuedAt: row.issued_at,
      usedAt: row.used_at,
      refundedAt: row.refunded_at,
      cancelledAt: row.cancelled_at,
      ticketTypeName: row.ticketTypeName,
      event: {
        id: row.eventId,
        title: row.eventTitle,
        startAt: row.eventStartAt,
        format: row.eventFormat,
        venueName: row.venueName,
        cityDisplay: row.cityDisplay,
        coverImageUrl: row.coverImageUrl
      }
    }));

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      LEFT JOIN events e ON e.id = t.event_id
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, params.slice(0, -2)); // Remove LIMIT/OFFSET params
    const total = parseInt(countResult.rows[0].total);

    return ok(res, req, {
      tickets,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || "Internal server error",
      data: null
    });
  }
};

const getTicketQR = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticketIdNum = parseInt(ticketId, 10);

    if (isNaN(ticketIdNum) || ticketIdNum <= 0) {
      return fail(res, req, 404, "INVALID_TICKET_ID", "Invalid ticket ID");
    }

    const query = `
      SELECT
        t.*,
        o.buyer_user_id
      FROM tickets t
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE t.id = $1
    `;

    const result = await pool.query(query, [ticketIdNum]);

    if (result.rowCount === 0) {
      return fail(res, req, 404, "TICKET_NOT_FOUND", "Ticket not found");
    }

    const ticket = result.rows[0];

    // Verify ownership
    if (ticket.buyer_user_id !== req.user.id) {
      return fail(res, req, 403, "FORBIDDEN", "No permission");
    }

    // Only return QR for ACTIVE tickets
    if (ticket.status !== 'ACTIVE') {
      return fail(res, req, 400, "INVALID_STATUS", "QR code not available for this ticket status");
    }

    const { generateTicketQR } = require('../services/qr.service');
    const qrPayload = generateTicketQR(ticket.id, ticket.event_id);

    return ok(res, req, {
      ticketId: ticket.id,
      qrPayload,
      status: ticket.status,
      expiresIn: 86400 // 24 hours in seconds
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || "Internal server error",
      data: null
    });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, upcoming } = req.query;
    const buyerUserId = req.user.id;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20));
    const offset = (pageNum - 1) * pageSizeNum;

    const conditions = ["o.buyer_user_id = $1"];
    const params = [buyerUserId];
    let paramCount = 2;

    if (status) {
      conditions.push(`o.status = $${paramCount++}`);
      params.push(status);
    }

    if (upcoming === 'true') {
      conditions.push(`e.start_at >= NOW()`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        o.id as "orderId",
        o.order_number,
        o.total_amount,
        o.status,
        o.created_at,
        e.id as "eventId",
        e.title as "eventTitle",
        e.start_at as "eventStartAt",
        e.format as "eventFormat",
        e.venue_name as "venueName",
        e.city_display as "cityDisplay",
        e.cover_image_url as "coverImageUrl",
        COUNT(t.id) as "ticketsCount",
        COUNT(CASE WHEN t.status = 'ACTIVE' THEN 1 END) as "activeTicketsCount"
      FROM orders o
      LEFT JOIN events e ON e.id = o.event_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN tickets t ON t.order_item_id = oi.id
      ${whereClause}
      GROUP BY o.id, e.id
      ORDER BY o.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;

    params.push(pageSizeNum, offset);

    const result = await pool.query(query, params);

    const orders = result.rows.map(row => ({
      orderId: row.orderId,
      orderNumber: row.order_number,
      totalAmount: row.total_amount,
      status: row.status,
      createdAt: row.created_at,
      eventSnapshot: {
        id: row.eventId,
        title: row.eventTitle,
        startAt: row.eventStartAt,
        format: row.eventFormat,
        venueName: row.venueName,
        cityDisplay: row.cityDisplay,
        coverImageUrl: row.coverImageUrl
      },
      ticketsCount: parseInt(row.ticketsCount),
      activeTicketsCount: parseInt(row.activeTicketsCount)
    }));

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM orders o
      LEFT JOIN events e ON e.id = o.event_id
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, params.slice(0, -2)); // Remove LIMIT/OFFSET params
    const total = parseInt(countResult.rows[0].total);

    return ok(res, req, {
      orders,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || "Internal server error",
      data: null
    });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderIdNum = validateOrderId(orderId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const orderResult = await pool.query(
        "SELECT * FROM orders WHERE id = $1 FOR UPDATE",
        [orderIdNum]
      );

      if (orderResult.rowCount === 0) {
        return fail(res, req, 404, "ORDER_NOT_FOUND", "Order not found");
      }

      const order = orderResult.rows[0];

      if (order.buyer_user_id !== req.user.id) {
        return fail(res, req, 403, "FORBIDDEN", "No permission");
      }

      await pool.query(
        "UPDATE orders SET status = 'cancelled' WHERE id = $1",
        [orderIdNum]
      );

      // Release inventory reservations (DO NOT decrement qty_sold since we never incremented it)
      await pool.query(
        "UPDATE inventory_reservations SET status = 'cancelled' WHERE order_id = $1",
        [orderIdNum]
      );

      await client.query("COMMIT");

      return ok(res, req, { message: "Order cancelled" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || "Internal server error",
      data: null
    });
  }
};

const getOrderTickets = async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderIdNum = validateOrderId(orderId);

    const ownershipResult = await pool.query(
      "SELECT buyer_user_id FROM orders WHERE id = $1",
      [orderIdNum]
    );

    if (ownershipResult.rowCount === 0) {
      return fail(res, req, 404, "ORDER_NOT_FOUND", "Order not found");
    }

    if (ownershipResult.rows[0].buyer_user_id !== req.user.id) {
      return fail(res, req, 403, "FORBIDDEN", "No permission");
    }

    const ticketsResult = await pool.query(
      "SELECT * FROM tickets WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)",
      [orderIdNum]
    );

    return ok(res, req, {
      orderId: orderIdNum,
      tickets: ticketsResult.rows
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || "Internal server error",
      data: null
    });
  }
};

const getTicketDetails = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticketIdNum = parseInt(ticketId, 10);

    if (isNaN(ticketIdNum) || ticketIdNum <= 0) {
      return fail(res, req, 404, "INVALID_TICKET_ID", "Invalid ticket ID");
    }

    const query = `
      SELECT
        t.*,
        tt.name as "ticketTypeName",
        tt.description as "ticketTypeDescription",
        e.title as "eventTitle",
        e.start_at as "eventStartAt",
        e.format as "eventFormat",
        e.venue_name as "venueName",
        e.city_display as "cityDisplay",
        e.cover_image_url as "coverImageUrl",
        o.buyer_user_id
      FROM tickets t
      LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
      LEFT JOIN events e ON e.id = t.event_id
      JOIN order_items oi ON oi.id = t.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE t.id = $1
    `;

    const result = await pool.query(query, [ticketIdNum]);

    if (result.rowCount === 0) {
      return fail(res, req, 404, "TICKET_NOT_FOUND", "Ticket not found");
    }

    const ticket = result.rows[0];

    if (ticket.buyer_user_id !== req.user.id) {
      return fail(res, req, 403, "FORBIDDEN", "No permission");
    }

    // Include QR payload only if ACTIVE
    let qrPayload = null;
    if (ticket.status === 'ACTIVE') {
      const { generateTicketQR } = require('../services/qr.service');
      qrPayload = generateTicketQR(ticket.id, ticket.event_id);
    }

    return ok(res, req, {
      ticket: {
        id: ticket.id,
        status: ticket.status,
        issuedAt: ticket.issued_at,
        usedAt: ticket.used_at,
        refundedAt: ticket.refunded_at,
        cancelledAt: ticket.cancelled_at,
        ticketCode: ticket.ticket_code,
        buyerName: ticket.buyer_name,
        buyerEmail: ticket.buyer_email,
        ticketType: {
          name: ticket.ticketTypeName,
          description: ticket.ticketTypeDescription
        },
        event: {
          id: ticket.event_id,
          title: ticket.eventTitle,
          startAt: ticket.eventStartAt,
          format: ticket.eventFormat,
          venueName: ticket.venueName,
          cityDisplay: ticket.cityDisplay,
          coverImageUrl: ticket.coverImageUrl
        },
        qrPayload // null if not ACTIVE
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || "Internal server error",
      data: null
    });
  }
};

const checkoutOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { orderId } = req.params;
    const orderIdNum = validateOrderId(orderId);

    console.log('💳 Checkout order called:', { orderId: orderIdNum, userId: req.user?.id });

    await client.query('BEGIN');

    // Get order with lock (include buyer info for tickets)
    const orderResult = await client.query(
      `SELECT o.*, u.name as buyer_name, u.email as buyer_email
       FROM orders o
       JOIN users u ON u.id = o.buyer_user_id
       WHERE o.id = $1 FOR UPDATE`,
      [orderIdNum]
    );

    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return fail(res, req, 404, "ORDER_NOT_FOUND", "Order not found");
    }

    const order = orderResult.rows[0];

    // Verify ownership
    if (order.buyer_user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return fail(res, req, 403, "FORBIDDEN", "No permission to checkout this order");
    }

    // Check if already completed
    if (order.status === 'PAID') {
      await client.query('ROLLBACK');
      return fail(res, req, 400, "ALREADY_COMPLETED", "Order already completed");
    }

    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      return fail(res, req, 400, "ORDER_CANCELLED", "Cannot complete a cancelled order");
    }

    // Check if expired
    if (order.expires_at && new Date(order.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return fail(res, req, 400, "ORDER_EXPIRED", "Order has expired");
    }

    // Update order to PAID
    await client.query(
      "UPDATE orders SET status = 'PAID', payment_status = 'paid', confirmed_at = NOW() WHERE id = $1",
      [orderIdNum]
    );

    console.log('✅ Order marked as PAID');

    // Get order items
    const itemsResult = await client.query(
      "SELECT * FROM order_items WHERE order_id = $1",
      [orderIdNum]
    );

    let totalTicketsCreated = 0;

    // Create tickets for each item
    for (const item of itemsResult.rows) {
      console.log(`🎫 Creating ${item.quantity} tickets for item ${item.id}`);

      // Create individual tickets
      for (let i = 0; i < item.quantity; i++) {
        await client.query(
          `INSERT INTO tickets (
            order_item_id, order_id, event_id, ticket_type_id, ticket_code,
            buyer_name, buyer_email, status, issued_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            item.id,
            order.id,
            order.event_id,
            item.ticket_type_id,
            generateTicketCode(),
            order.buyer_name,    // Use buyer info from order
            order.buyer_email,   // Use buyer info from order
            'ACTIVE'
          ]
        );
        totalTicketsCreated++;
      }

      // Consume reservations
      await client.query(
        "UPDATE inventory_reservations SET status = 'consumed' WHERE order_id = $1 AND ticket_type_id = $2",
        [orderIdNum, item.ticket_type_id]
      );

      // Update ticket type qty_sold
      await client.query(
        "UPDATE ticket_types SET qty_sold = qty_sold + $1 WHERE id = $2",
        [item.quantity, item.ticket_type_id]
      );
    }

    // Update events.tickets_sold with total tickets for this event
    const totalTicketsResult = await client.query(
      "SELECT COUNT(*) as total FROM tickets WHERE event_id = $1 AND status = 'ACTIVE'",
      [order.event_id]
    );
    const totalTickets = parseInt(totalTicketsResult.rows[0].total);

    await client.query(
      "UPDATE events SET tickets_sold = $1 WHERE id = $2",
      [totalTickets, order.event_id]
    );

    console.log(`✅ Created ${totalTicketsCreated} tickets and updated event tickets_sold to ${totalTickets}`);

    await client.query('COMMIT');

    return ok(res, req, {
      orderId: orderIdNum,
      status: 'PAID',
      ticketsCreated: totalTicketsCreated,
      eventId: order.event_id,
      message: 'Order completed successfully'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Checkout error:', err);
    return fail(res, req, 500, "CHECKOUT_FAILED", err.message);
  } finally {
    client.release();
  }
};

module.exports = {
  createOrder,
  getOrderDetails,
  getMyOrders,
  getMyTickets,
  cancelOrder,
  getOrderTickets,
  getTicketDetails,
  getTicketQR,
  checkoutOrder,
};