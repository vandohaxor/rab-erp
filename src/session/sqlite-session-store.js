'use strict';

const { Store } = require('express-session');
const db = require('../config/database');

class SqliteStore extends Store {
  constructor(options = {}) {
    super(options);
    this.defaultTtl = options.ttl || 1000 * 60 * 60 * 8;
    this.sweep();
    this.timer = setInterval(() => this.sweep(), 1000 * 60 * 10);
    this.timer.unref?.();
  }

  get(sid, callback) {
    try {
      const now = Date.now();
      const row = db.db.get('SELECT sess, expires FROM sessions WHERE sid = ?', sid);
      if (!row) return callback(null, null);
      if (row.expires && Number(row.expires) < now) {
        db.db.run('DELETE FROM sessions WHERE sid = ?', sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, session, callback = () => {}) {
    try {
      const maxAge = session.cookie?.maxAge ?? this.defaultTtl;
      const expires = Date.now() + maxAge;
      const payload = JSON.stringify(session);
      db.db.run(
        `INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`,
        sid,
        payload,
        expires,
      );
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, session, callback = () => {}) {
    return this.set(sid, session, callback);
  }

  destroy(sid, callback = () => {}) {
    try {
      db.db.run('DELETE FROM sessions WHERE sid = ?', sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  length(callback) {
    try {
      const row = db.db.get('SELECT COUNT(*) AS total FROM sessions WHERE expires > ?', Date.now());
      return callback(null, Number(row?.total || 0));
    } catch (error) {
      return callback(error);
    }
  }

  clear(callback = () => {}) {
    try {
      db.db.run('DELETE FROM sessions');
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  sweep() {
    try {
      db.db.run('DELETE FROM sessions WHERE expires < ?', Date.now());
    } catch {
      /* diamkan: bukan kegagalan kritis */
    }
  }
}

module.exports = SqliteStore;
