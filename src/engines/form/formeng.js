// src/core/engines/formEngine.js
// Xử lý các engine config.type === 'form' (vd: google_sb, eset, kaspersky...).
//
// Luồng:
//   1. Mở Chromium KHÔNG headless (để bạn nhìn thấy + tự giải captcha được)
//   2. Điều hướng tới form, tự điền các field theo 'profile' của engine đó
//   3. Đính kèm ảnh evidence nếu form có input file
//   4. Nếu requires_captcha=true: DỪNG LẠI, không bấm submit, giữ browser mở,
//      lưu session vào SESSIONS map theo report.id -> để formEngine.closeSession()
//      gọi sau khi bạn tự bấm submit thật + bấm "Đã giải xong" trên admin UI
//   5. Nếu requires_captcha=false: tự bấm submit, đóng browser, coi như xong
//
// QUAN TRỌNG: các selector (CSS selector cho từng field) dưới đây là PLACEHOLDER,
// mình không có cách xác nhận DOM thật của từng trang tại thời điểm này. Bắt buộc
// phải mở DevTools trên từng form thật, lấy đúng selector rồi điền vào FORM_PROFILES
// trước khi chạy — nếu không form sẽ điền sai chỗ hoặc lỗi "element not found".
//
// Cài đặt: npm install playwright && npx playwright install chromium

const { chromium } = require('playwright');
const logger = require('../logger');
const { refang } = require('../evidence');

// Session trình duyệt đang mở chờ người giải captcha, key = report.id
const SESSIONS = new Map();

const FORM_PROFILES = {
  google_sb: {
    // TODO: inspect https://safebrowsing.google.com/safebrowsing/report_phish/
    // và điền đúng selector thật (form của Google hay đổi cấu trúc theo thời gian)
    urlField: 'input[name="url"]',        // PLACEHOLDER
    descriptionField: 'textarea[name="comment"]', // PLACEHOLDER
    submitButton: 'button[type="submit"]', // PLACEHOLDER
  },
  eset: {
    // TODO: inspect https://phishing.eset.com/en-us/report
    urlField: 'input[name="url"]',        // PLACEHOLDER
    descriptionField: 'textarea[name="description"]', // PLACEHOLDER
    fileField: 'input[type="file"]',      // PLACEHOLDER
    submitButton: 'button[type="submit"]', // PLACEHOLDER
  },
};

async function launchAndFill(report, engineId, engineDef, evidencePaths) {
  const log = logger.forReport(report);
  const profile = FORM_PROFILES[engineId];
  if (!profile) {
    throw new Error(`Chưa có form profile cho engine '${engineId}' — thêm vào FORM_PROFILES trước`);
  }

  const targetUrl = engineDef.url || engineDef.endpoint;
  const browser = await chromium.launch({ headless: false }); // KHÔNG headless để bạn thao tác được
  const context = await browser.newContext();
  const page = await context.newPage();

  log.info('opening form for autofill', { targetUrl });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const reportedUrl = refang(report.url);

  try {
    if (profile.urlField) {
      await page.fill(profile.urlField, reportedUrl);
    }
    if (profile.descriptionField) {
      await page.fill(profile.descriptionField, `Auto-reported ${report.category} URL: ${reportedUrl}`);
    }
    if (profile.fileField && evidencePaths?.screenshotPath) {
      const path = require('path');
      const absPath = path.join(__dirname, '..', '..', '..', evidencePaths.screenshotPath);
      await page.setInputFiles(profile.fileField, absPath);
    }
  } catch (err) {
    log.error('autofill failed — có thể selector sai, cần cập nhật FORM_PROFILES', { error: err.message });
    // Vẫn giữ browser mở để bạn tự điền tay nếu autofill lỗi, không throw ở đây
  }

  if (engineDef.requires_captcha) {
    SESSIONS.set(report.id, { browser, context, page });
    log.info('form filled, paused for manual captcha + submit', { reportId: report.id });
    return { ok: true, needsCaptcha: true };
  }

  // Không cần captcha -> tự bấm submit luôn
  try {
    await page.click(profile.submitButton, { timeout: 10000 });
    log.info('auto-submitted form (no captcha required)');
  } finally {
    await browser.close();
  }
  return { ok: true, needsCaptcha: false };
}

// Gọi khi user bấm "Đã giải xong" trên admin UI — đóng browser session đang chờ
async function closeSession(reportId) {
  const session = SESSIONS.get(reportId);
  if (!session) return; // không có session mở (vd server đã restart) — bỏ qua, không lỗi
  try {
    await session.browser.close();
  } finally {
    SESSIONS.delete(reportId);
  }
}

module.exports = { launchAndFill, closeSession, FORM_PROFILES };