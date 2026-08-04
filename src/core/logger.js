// src/core/logger.js
// Logger tối giản: in ra console có màu theo level + ghi append vào file log/*.log theo ngày.
// Không phụ thuộc thư viện ngoài để giữ core nhẹ.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function currentLogFile() {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(LOG_DIR, `${stamp}.log`);
}

function write(level, msg, meta) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const ts = new Date().toISOString();
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}${metaStr}`;

  const color = COLORS[level] || '';
  console.log(`${color}${line}${RESET}`);

  fs.appendFile(currentLogFile(), line + '\n', (err) => {
    if (err) console.error('logger: failed to write log file', err);
  });
}

// meta là object tuỳ chọn, ví dụ: logger.info('report submitted', { reportId, engine })
module.exports = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),

  // Log riêng cho 1 report, tự gắn reportId + url vào meta để dễ grep sau này
  forReport(report) {
    const base = { reportId: report.id, url: report.url, engine: report.engineId };
    return {
      debug: (msg, meta) => write('debug', msg, { ...base, ...meta }),
      info: (msg, meta) => write('info', msg, { ...base, ...meta }),
      warn: (msg, meta) => write('warn', msg, { ...base, ...meta }),
      error: (msg, meta) => write('error', msg, { ...base, ...meta }),
    };
  },
};