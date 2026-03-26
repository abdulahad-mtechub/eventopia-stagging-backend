const pool = require("../db");

/**
 * Guru Service
 * Handles Guru activation, levels, and dashboard data
 */
class GuruService {
  /**
   * Check if Guru account is active
   * @param {number} guruId - Guru user ID
   * @returns {Promise<boolean>} Is active
   */
  static async isGuruActive(guruId) {
    const result = await pool.query(
      'SELECT guru_active, guru_active_until FROM users WHERE id = $1',
      [guruId]
    );

    if (result.rowCount === 0) {
      return false;
    }

    const { guru_active, guru_active_until } = result.rows[0];

    if (!guru_active) {
      return false;
    }

    // Check if activation hasn't expired
    if (guru_active_until && new Date() > new Date(guru_active_until)) {
      return false;
    }

    return true;
  }

  /**
   * Get Guru's current level
   * @param {number} guruId - Guru user ID
   * @returns {Promise<Object>} Level info
   */
  static async getCurrentLevel(guruId) {
    const result = await pool.query(
      `SELECT gl.*, gcr.rate_per_ticket
       FROM guru_levels gl
       LEFT JOIN guru_commission_rates gcr ON gcr.level = gl.level
       WHERE gl.guru_id = $1 AND gl.effective_until IS NULL
       ORDER BY gl.effective_from DESC
       LIMIT 1`,
      [guruId]
    );

    if (result.rowCount === 0) {
      // Create default level 1 if none exists
      return this.setGuruLevel(guruId, 1, null, 'Default level');
    }

    return result.rows[0];
  }

  /**
   * Set Guru level (creates new level record)
   * @param {number} guruId - Guru user ID
   * @param {number} level - Level (1-3)
   * @param {number|null} adminId - Admin who set the level
   * @param {string} reason - Reason for level change
   * @returns {Promise<Object>} New level record
   */
  static async setGuruLevel(guruId, level, adminId, reason) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Close current level
      await client.query(
        `UPDATE guru_levels
         SET effective_until = NOW()
         WHERE guru_id = $1 AND effective_until IS NULL`,
        [guruId]
      );

      // Get rate and service_fee_rate for level
      const rateResult = await client.query(
        'SELECT rate_per_ticket, service_fee_rate FROM guru_commission_rates WHERE level = $1',
        [level]
      );

      if (rateResult.rowCount === 0) {
        throw new Error(`Invalid level: ${level}`);
      }

      const { rate_per_ticket: ratePerTicket, service_fee_rate: serviceFeeRate } = rateResult.rows[0];
      const effectiveServiceFeeRate = serviceFeeRate != null ? serviceFeeRate : 0.2;

      // Create new level record
      const result = await client.query(
        `INSERT INTO guru_levels
          (guru_id, level, rate_per_ticket, service_fee_rate, created_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [guruId, level, ratePerTicket, effectiveServiceFeeRate, adminId, reason]
      );

      // Log admin action
      if (adminId) {
        await client.query(
          `INSERT INTO admin_guru_actions
            (admin_id, guru_id, action_type, old_value, new_value, reason)
           VALUES ($1, $2, 'level_change', NULL, $3, $4)`,
          [adminId, guruId, `Level ${level}`, reason]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Set Guru level error:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get Guru's level history
   * @param {number} guruId - Guru user ID
   * @returns {Promise<Array>} Level history
   */
  static async getLevelHistory(guruId) {
    const result = await pool.query(
      `SELECT gl.*, u.name as admin_name
       FROM guru_levels gl
       LEFT JOIN users u ON u.id = gl.created_by
       WHERE gl.guru_id = $1
       ORDER BY gl.effective_from DESC`,
      [guruId]
    );

    return result.rows;
  }

  /**
   * Get dashboard summary for Guru
   * @param {number} guruId - Guru user ID
   * @param {Date} dateFrom - Start date
   * @param {Date} dateTo - End date
   * @returns {Promise<Object>} Dashboard summary
   */
  static async getDashboardSummary(guruId, dateFrom, dateTo) {
    const params = [guruId];
    let whereClause = 'WHERE pgl.guru_user_id = $1';

    if (dateFrom) {
      params.push(dateFrom);
      whereClause += ` AND e.created_at >= $${params.length}`;
    }

    if (dateTo) {
      params.push(dateTo);
      whereClause += ` AND e.created_at <= $${params.length}`;
    }

    // Get promoters count
    const promotersResult = await pool.query(
      `SELECT COUNT(DISTINCT pgl.promoter_user_id) as count
       FROM promoter_guru_links pgl
       WHERE pgl.guru_user_id = $1`,
      [guruId]
    );

    // Get tickets sold through attached promoters
    const ticketsResult = await pool.query(
      `SELECT COUNT(DISTINCT t.id) as tickets_sold
       FROM promoter_guru_links pgl
       LEFT JOIN events e ON e.promoter_id = pgl.promoter_user_id
       LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'sold'
       ${whereClause}`,
      params
    );

    // Get total sales
    const salesResult = await pool.query(
      `SELECT COALESCE(SUM(o.total_amount), 0) as gross_sales
       FROM promoter_guru_links pgl
       LEFT JOIN events e ON e.promoter_id = pgl.promoter_user_id
       LEFT JOIN orders o ON o.event_id = e.id AND o.status = 'confirmed'
       ${whereClause}`,
      params
    );

    // Get commissions earned
    const commissionsResult = await pool.query(
      `SELECT COALESCE(SUM(total_commission), 0) as total_commissions
       FROM guru_commissions
       WHERE guru_id = $1 AND status = 'paid'`,
      [guruId]
    );

    // Get pending commissions
    const pendingResult = await pool.query(
      `SELECT COALESCE(SUM(total_commission), 0) as pending_commissions
       FROM guru_commissions
       WHERE guru_id = $1 AND status = 'pending'`,
      [guruId]
    );

    return {
      promotersCount: parseInt(promotersResult.rows[0].count),
      ticketsSoldTotal: parseInt(ticketsResult.rows[0].tickets_sold),
      grossSales: parseInt(salesResult.rows[0].gross_sales),
      commissionsEarned: parseInt(commissionsResult.rows[0].total_commissions),
      pendingCommissions: parseInt(pendingResult.rows[0].pending_commissions)
    };
  }

  /**
   * Get list of attached promoters
   * @param {number} guruId - Guru user ID
   * @param {Date} dateFrom - Start date
   * @param {Date} dateTo - End date
   * @returns {Promise<Array>} Promoters list
   */
  static async getAttachedPromoters(guruId, dateFrom, dateTo) {
    const params = [guruId];
    let whereClause = 'WHERE pgl.guru_user_id = $1';

    if (dateFrom) {
      params.push(dateFrom);
      whereClause += ` AND pgl.created_at >= $${params.length}`;
    }

    if (dateTo) {
      params.push(dateTo);
      whereClause += ` AND pgl.created_at <= $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
         pgl.promoter_user_id as id,
         u.name,
         u.email,
         pgl.created_at as attached_at,
         COUNT(DISTINCT e.id) as events_count,
         COUNT(DISTINCT t.id) as tickets_sold,
         COALESCE(SUM(o.total_amount), 0) as gross_sales
       FROM promoter_guru_links pgl
       JOIN users u ON u.id = pgl.promoter_user_id
       LEFT JOIN events e ON e.promoter_id = pgl.promoter_user_id
       LEFT JOIN orders o ON o.event_id = e.id AND o.status = 'confirmed'
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN tickets t ON t.order_item_id = oi.id AND t.status = 'sold'
       ${whereClause}
       GROUP BY pgl.promoter_user_id, u.name, u.email, pgl.created_at
       ORDER BY pgl.created_at DESC`,
      params
    );

    return result.rows;
  }

  /**
   * Get performance data for a specific promoter
   * @param {number} guruId - Guru user ID
   * @param {number} promoterId - Promoter user ID
   * @param {Date} dateFrom - Start date
   * @param {Date} dateTo - End date
   * @returns {Promise<Object>} Performance data
   */
  static async getPromoterPerformance(guruId, promoterId, dateFrom, dateTo) {
    // Verify attachment
    const linkResult = await pool.query(
      'SELECT * FROM promoter_guru_links WHERE promoter_user_id = $1 AND guru_user_id = $2',
      [promoterId, guruId]
    );

    if (linkResult.rowCount === 0) {
      throw new Error('Promoter is not attached to this Guru');
    }

    const params = [promoterId, guruId];
    let whereClause = 'WHERE e.promoter_id = $1 AND e.guru_id = $2';

    if (dateFrom) {
      params.push(dateFrom);
      whereClause += ` AND e.created_at >= $${params.length}`;
    }

    if (dateTo) {
      params.push(dateTo);
      whereClause += ` AND e.created_at <= $${params.length}`;
    }

    // Get promoter info
    const promoterResult = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [promoterId]
    );

    // Get events
    const eventsResult = await pool.query(
      `SELECT
         e.id,
         e.title,
         e.start_at,
         e.status,
         COUNT(DISTINCT t.id) as tickets_sold,
         COALESCE(SUM(o.total_amount), 0) as gross_sales
       FROM events e
       LEFT JOIN orders o ON o.event_id = e.id AND o.status = 'confirmed'
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN tickets t ON t.order_item_id = oi.id AND t.status = 'sold'
       ${whereClause}
       GROUP BY e.id, e.title, e.start_at, e.status
       ORDER BY e.start_at DESC`,
      params
    );

    return {
      promoter: promoterResult.rows[0],
      events: eventsResult.rows
    };
  }

  /**
   * Manually attach a promoter to a Guru (admin-controlled)
   * @param {number} guruId - Guru user ID
   * @param {number} promoterId - Promoter user ID
   * @param {number} adminId - Admin performing the action
   * @returns {Promise<Object>} Link record
   */
  static async manuallyAttachPromoter(guruId, promoterId, adminId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if link already exists
      const existing = await client.query(
        'SELECT * FROM promoter_guru_links WHERE promoter_user_id = $1',
        [promoterId]
      );

      if (existing.rowCount > 0) {
        // Update existing link
        const result = await client.query(
          `UPDATE promoter_guru_links
           SET guru_user_id = $1, source = 'admin', changed_at = NOW(), changed_by_admin_id = $2
           WHERE promoter_user_id = $3
           RETURNING *`,
          [guruId, adminId, promoterId]
        );

        // Log admin action
        await client.query(
          `INSERT INTO admin_guru_actions
            (admin_id, guru_id, action_type, old_value, new_value, reason)
           VALUES ($1, $2, 'promoter_attachment', $3, $4, 'Manual attachment')`,
          [adminId, guruId, `Attached to Guru ${existing.rows[0].guru_user_id}`, `Attached to Guru ${guruId}`]
        );

        await client.query('COMMIT');
        return result.rows[0];
      } else {
        // Create new link
        const result = await client.query(
          `INSERT INTO promoter_guru_links
            (promoter_user_id, guru_user_id, source, changed_by_admin_id)
           VALUES ($1, $2, 'admin', $3)
           RETURNING *`,
          [promoterId, guruId, adminId]
        );

        // Log admin action
        await client.query(
          `INSERT INTO admin_guru_actions
            (admin_id, guru_id, action_type, new_value, reason)
           VALUES ($1, $2, 'promoter_attachment', $3, 'Manual attachment')`,
          [adminId, guruId, `Attached promoter ${promoterId}`]
        );

        await client.query('COMMIT');
        return result.rows[0];
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Attach promoter error:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Detach a promoter from a Guru
   * @param {number} guruId - Guru user ID
   * @param {number} promoterId - Promoter user ID
   * @param {number} adminId - Admin performing the action
   * @returns {Promise<void>}
   */
  static async detachPromoter(guruId, promoterId, adminId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify link exists
      const linkResult = await client.query(
        'SELECT * FROM promoter_guru_links WHERE promoter_user_id = $1 AND guru_user_id = $2',
        [promoterId, guruId]
      );

      if (linkResult.rowCount === 0) {
        throw new Error('Promoter is not attached to this Guru');
      }

      // Delete link
      await client.query(
        'DELETE FROM promoter_guru_links WHERE promoter_user_id = $1',
        [promoterId]
      );

      // Log admin action
      await client.query(
        `INSERT INTO admin_guru_actions
          (admin_id, guru_id, action_type, old_value, reason)
         VALUES ($1, $2, 'promoter_detachment', $3, 'Manual detachment')`,
        [adminId, guruId, `Detached promoter ${promoterId}`]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Detach promoter error:', err);
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = GuruService;
