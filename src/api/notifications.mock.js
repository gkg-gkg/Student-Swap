import { db, save, currentUserRecord } from './mock/db.js';
import { mockCall } from './mock/util.js';

/** GET /me/notifications */
export function listNotifications() {
  return mockCall(
    () => {
      const me = currentUserRecord();
      return db.notifications.filter((n) => n.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    { ms: 150 },
  );
}

/** POST /me/notifications/read (omit ids to mark all read) @param {string[]} [ids] */
export function markRead(ids) {
  return mockCall(
    () => {
      const me = currentUserRecord();
      for (const n of db.notifications) if (n.userId === me.id && (!ids || ids.includes(n.id))) n.read = true;
      save();
      return { ok: true };
    },
    { ms: 100 },
  );
}

/** PATCH /me/notification-prefs @param {Partial<import('../types/index.js').User['notificationPrefs']>} prefs */
export function updatePrefs(prefs) {
  return mockCall(
    () => {
      const me = currentUserRecord();
      me.notificationPrefs = { ...me.notificationPrefs, ...prefs };
      save();
      return me.notificationPrefs;
    },
    { ms: 100 },
  );
}
