// src/core/queue.js
// Hàng đợi report, persist bằng SQLite (data/reports.db) thay vì mảng in-memory
// như bản mock trong admin/index.html. Đây là nguồn sự thật duy nhất (single source
// of truth) cho cả worker nền lẫn API mà admin UI gọi tới.
//
// State machine của 1 report:
//   pending -> in_progress -> submitted
//                          -> needs_captcha -> (người xử lý tay) -> submitted
//                          -> failed -> (retry) -> in_progress / needs_captcha
//
// Cài đặt: npm install better-sqlite3

const path = require('path');
const Database = require('better-sqlite3');
const logger = require('./logger');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'reports.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    category TEXT NOT NULL,
    engine_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    evidence_path TEXT,
    fail_reason TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
`);

const VALID_STATUSES = ['pending', 'in_progress', 'needs_captcha', 'submitted', 'failed'];

function touch(id) {
  db.prepare(`UPDATE reports SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

function add({ url, category, engineId }) {
  const stmt = db.prepare(
    `INSERT INTO reports (url, category, engine_id, status) VALUES (?, ?, ?, 'pending')`
  );
  const info = stmt.run(url, category, engineId);
  logger.info('report added to queue', { reportId: info.lastInsertRowid, url, engineId });
  return get(info.lastInsertRowid);
}

function get(id) {
  return db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id);
}

function list({ status, category, engineId, search } = {}) {
  let sql = `SELECT * FROM reports WHERE 1=1`;
  const params = [];

  if (status) { sql += ` AND status = ?`; params.push(status); }
  if (category) { sql += ` AND category = ?`; params.push(category); }
  if (engineId) { sql += ` AND engine_id = ?`; params.push(engineId); }
  if (search) { sql += ` AND url LIKE ?`; params.push(`%${search}%`); }

  sql += ` ORDER BY updated_at DESC`;
  return db.prepare(sql).all(...params);
}

function counts() {
  const rows = db.prepare(`SELECT status, COUNT(*) as n FROM reports GROUP BY status`).all();
  const out = { total: 0 };
  VALID_STATUSES.forEach(s => (out[s] = 0));
  rows.forEach(r => { out[r.status] = r.n; out.total += r.n; });
  return out;
}

// Lấy report kế tiếp cần worker xử lý (pending, hoặc failed còn lượt retry).
// Không lấy needs_captcha vì đang chờ người, không lấy in_progress vì đang chạy dở.
function nextPending() {
  return db.prepare(
    `SELECT * FROM reports WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
  ).get();
}

function setStatus(id, status, extra = {}) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const fields = ['status = ?'];
  const params = [status];

  if (extra.evidencePath !== undefined) { fields.push('evidence_path = ?'); params.push(extra.evidencePath); }
  if (extra.failReason !== undefined) { fields.push('fail_reason = ?'); params.push(extra.failReason); }

  params.push(id);
  db.prepare(`UPDATE reports SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
  return get(id);
}

// Người dùng bấm "Đã giải xong CAPTCHA" trên admin UI -> đánh dấu submitted
function markSubmittedByUser(id) {
  const r = get(id);
  if (!r) throw new Error('Report not found');
  if (r.status !== 'needs_captcha') {
    throw new Error(`Cannot mark submitted from status ${r.status}`);
  }
  logger.forReport(r).info('marked submitted after manual captcha');
  return setStatus(id, 'submitted');
}

// Đưa report failed quay lại hàng đợi để worker thử lại
function retry(id) {
  const r = get(id);
  if (!r) throw new Error('Report not found');
  db.prepare(`UPDATE reports SET status = 'pending', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`).run(id);
  logger.forReport(r).info('requeued for retry', { attempts: r.attempts + 1 });
  return get(id);
}

module.exports = {
  add,
  get,
  list,
  counts,
  nextPending,
  setStatus,
  markSubmittedByUser,
  retry,
  VALID_STATUSES,
};