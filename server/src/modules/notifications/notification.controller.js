const { Op } = require('sequelize');
const Notification = require('./notification.model');
const NotificationRead = require('./notificationRead.model');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * Build the where clause that limits a query to notifications visible to the
 * current user: either targeted at them by user_id or broadcast to their role.
 */
function visibleClause(req) {
  const tenantId = req.tenant.id;
  const userId = req.user.userId;
  const role = req.user.role;
  return {
    tenant_id: tenantId,
    [Op.or]: [
      { recipient_user_id: userId },
      { recipient_user_id: null, recipient_role: role },
    ],
  };
}

/**
 * Shape a notification row for the client; merges per-user read state for
 * broadcast rows (where Notification.read_at is shared).
 */
function shapeForUser(row, readMap) {
  const plain = row.get ? row.get({ plain: true }) : row;
  let readAt = plain.read_at;
  if (plain.recipient_user_id == null && readMap.has(plain.id)) {
    readAt = readMap.get(plain.id);
  }
  return {
    id: plain.id,
    title: plain.title,
    body: plain.body,
    data: plain.data_json || null,
    created_at: plain.created_at,
    read_at: readAt || null,
    read: !!readAt,
  };
}

exports.list = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const userId = req.user.userId;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const unreadOnly = String(req.query.unread || '').toLowerCase() === 'true';

    const where = visibleClause(req);
    const rows = await Notification.findAll({
      where,
      limit,
      order: [['created_at', 'DESC']],
    });

    const broadcastIds = rows
      .filter((r) => r.recipient_user_id == null)
      .map((r) => r.id);

    let readMap = new Map();
    if (broadcastIds.length > 0) {
      const reads = await NotificationRead.findAll({
        where: {
          tenant_id: tenantId,
          user_id: userId,
          notification_id: broadcastIds,
        },
        attributes: ['notification_id', 'read_at'],
      });
      for (const r of reads) {
        readMap.set(r.notification_id, r.read_at);
      }
    }

    let data = rows.map((r) => shapeForUser(r, readMap));
    if (unreadOnly) data = data.filter((n) => !n.read);

    res.status(200).json({
      data,
      unread_count: data.filter((n) => !n.read).length,
    });
  } catch (err) {
    console.error('notifications.list error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.unreadCount = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const userId = req.user.userId;
    const where = visibleClause(req);

    const rows = await Notification.findAll({
      where,
      attributes: ['id', 'recipient_user_id', 'read_at'],
    });

    const broadcastIds = rows
      .filter((r) => r.recipient_user_id == null)
      .map((r) => r.id);

    let readSet = new Set();
    if (broadcastIds.length > 0) {
      const reads = await NotificationRead.findAll({
        where: {
          tenant_id: tenantId,
          user_id: userId,
          notification_id: broadcastIds,
        },
        attributes: ['notification_id'],
      });
      for (const r of reads) readSet.add(r.notification_id);
    }

    let unread = 0;
    for (const r of rows) {
      const isUserRow = r.recipient_user_id != null;
      if (isUserRow) {
        if (!r.read_at) unread += 1;
      } else if (!readSet.has(r.id)) {
        unread += 1;
      }
    }
    res.status(200).json({ unread_count: unread });
  } catch (err) {
    console.error('notifications.unreadCount error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const userId = req.user.userId;
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ message: 'Invalid id' });

    const where = visibleClause(req);
    where.id = id;
    const row = await Notification.findOne({ where });
    if (!row) return res.status(404).json({ message: 'Not found' });

    if (row.recipient_user_id) {
      if (!row.read_at) {
        await row.update({ read_at: new Date() });
      }
    } else {
      await NotificationRead.findOrCreate({
        where: { tenant_id: tenantId, user_id: userId, notification_id: row.id },
        defaults: {
          tenant_id: tenantId,
          user_id: userId,
          notification_id: row.id,
          read_at: new Date(),
        },
      });
    }
    res.status(200).json({ message: 'Marked as read' });
  } catch (err) {
    console.error('notifications.markRead error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const userId = req.user.userId;
    const role = req.user.role;

    await Notification.update(
      { read_at: new Date() },
      {
        where: {
          tenant_id: tenantId,
          recipient_user_id: userId,
          read_at: null,
        },
      }
    );

    const broadcasts = await Notification.findAll({
      where: { tenant_id: tenantId, recipient_user_id: null, recipient_role: role },
      attributes: ['id'],
    });

    if (broadcasts.length > 0) {
      const broadcastIds = broadcasts.map((r) => r.id);
      const existing = await NotificationRead.findAll({
        where: {
          tenant_id: tenantId,
          user_id: userId,
          notification_id: broadcastIds,
        },
        attributes: ['notification_id'],
      });
      const existingSet = new Set(existing.map((r) => r.notification_id));
      const toCreate = broadcastIds
        .filter((id) => !existingSet.has(id))
        .map((id) => ({
          tenant_id: tenantId,
          user_id: userId,
          notification_id: id,
          read_at: new Date(),
        }));
      if (toCreate.length > 0) {
        await NotificationRead.bulkCreate(toCreate);
      }
    }

    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('notifications.markAllRead error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
