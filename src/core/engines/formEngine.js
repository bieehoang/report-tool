// src/core/engines/formEngine.js
// Xử lý engine config.type === 'form' theo mô hình NHIỀU CHẶNG (phases), vì
// mỗi trang có thứ tự khác nhau: có trang điền trước-captcha sau (eset), có
// trang bắt giải captcha TRƯỚC rồi mới hiện form. Model chặng giải quyết được
// cả 2 kiểu (và bất kỳ thứ tự xen kẽ nào khác) mà không cần code riêng.
//
// Mỗi profile (profiles/form/<engineId>.js) khai báo:
//   phases: [
//     { manual: false, run: async (page, report) => {...} },   // tự động
//     { manual: true,  label: 'Giải captcha rồi bấm Submit' },  // dừng chờ người
//     ...
//   ]
// Tool chạy tuần tự từng phase. Gặp phase manual: DỪNG lại, giữ browser mở,
// trả needsCaptcha=true kèm label để hiển thị lên admin UI. Khi người dùng bấm
// "Đã giải xong" -> gọi resume() -> chạy tiếp phase kế tiếp cho tới khi hết
// mảng phases (lúc đó coi như xong, đóng browser) hoặc gặp phase manual khác
// (lại dừng, không tự đóng browser).
//
// Cài đặt: npm install playwright && npx playwright install chromium

const { chromium } = require('playwright');
const logger = require('../logger');
const { loadFormProfiles } = require('./profiles');

const PROFILES = loadFormProfiles();

// Session trình duyệt đang mở, key = report.id
// { browser, context, page, phases, index }
const SESSIONS = new Map();

async function runFromCurrentPhase(report) {
  const log = logger.forReport(report);
  const session = SESSIONS.get(report.id);
  if (!session) throw new Error('Không tìm thấy phiên trình duyệt đang mở cho report này (có thể server đã restart)');

  const { page, phases } = session;

  while (session.index < phases.length) {
    const phase = phases[session.index];

    if (phase.manual) {
      log.info('paused at manual phase', { reportId: report.id, phase: phase.label || `#${session.index}` });
      return { ok: true, needsCaptcha: true, phaseLabel: phase.label || null };
    }

    try {
      await phase.run(page, report, session.engineDef, session.evidencePaths);
    } catch (err) {
      log.error('phase failed — giữ browser mở để bạn kiểm tra/điền tay', {
        phaseIndex: session.index, error: err.message,
      });
      // Không đóng browser khi lỗi, để bạn tự xử lý trực tiếp trên trang đang mở
      return { ok: true, needsCaptcha: true, phaseLabel: `Lỗi tự động ở bước ${session.index + 1}: ${err.message}` };
    }

    session.index += 1;
  }

  // Hết phases -> coi như xong hoàn toàn
  await session.browser.close();
  SESSIONS.delete(report.id);
  log.info('all phases complete, browser closed', { reportId: report.id });
  return { ok: true, needsCaptcha: false };
}

// Bắt đầu xử lý 1 report mới: mở browser, chạy phases[0] trở đi
async function start(report, engineId, engineDef, evidencePaths) {
  const log = logger.forReport(report);
  const profile = PROFILES[engineId];
  if (!profile) {
    throw new Error(`Chưa có form profile cho engine '${engineId}' — tạo file src/core/engines/profiles/form/${engineId}.js`);
  }
  if (!Array.isArray(profile.phases) || profile.phases.length === 0) {
    throw new Error(`Profile '${engineId}' thiếu mảng 'phases' hợp lệ — xem mẫu trong profiles/form/eset.js`);
  }

  const targetUrl = engineDef.url || engineDef.endpoint;
  const browser = await chromium.launch({ headless: false }); // KHÔNG headless để bạn thao tác được
  const context = await browser.newContext();
  const page = await context.newPage();

  log.info('opening form', { targetUrl });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  SESSIONS.set(report.id, { browser, context, page, phases: profile.phases, index: 0, engineDef, evidencePaths });
  return runFromCurrentPhase(report);
}

// Gọi khi user bấm "Đã giải xong" trên admin UI — chạy tiếp phase kế tiếp
async function resume(report) {
  const session = SESSIONS.get(report.id);
  if (!session) throw new Error('Không có phiên trình duyệt đang mở cho report này — có thể server đã restart, cần bấm "Thử lại" thay vì "Đã giải xong"');
  session.index += 1;
  return runFromCurrentPhase(report);
}

function hasOpenSession(reportId) {
  return SESSIONS.has(reportId);
}

// Đóng cưỡng bức 1 session (dọn dẹp khi report bị huỷ/retry giữa chừng)
async function forceClose(reportId) {
  const session = SESSIONS.get(reportId);
  if (!session) return;
  try { await session.browser.close(); } finally { SESSIONS.delete(reportId); }
}

module.exports = { start, resume, hasOpenSession, forceClose };