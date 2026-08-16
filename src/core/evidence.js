// src/core/evidence.js
// Chụp ảnh bằng chứng cho 1 URL vi phạm trước khi submit report.
// Dùng Playwright vì cùng 1 thư viện sẽ được worker dùng lại để tự điền form
// (src/core/engines/*.js ở bước sau) -> khỏi phải quản 2 trình duyệt khác nhau.
//
// LƯU Ý AN TOÀN: URL trong hệ thống này luôn ở dạng "defanged" (hxxp://, [.] )
// để tránh click nhầm / tránh bị các tool khác tự động theo link. Trước khi
// điều hướng trình duyệt thật sự, evidence.js sẽ "refang" lại URL. Đảm bảo
// việc refang chỉ xảy ra ở biên này, ngay trước khi mở trình duyệt, không lưu
// URL đã refang ngược lại DB.
//
// Cài đặt: npm install playwright && npx playwright install chromium

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const logger = require('./logger');

const EVIDENCE_DIR = path.join(__dirname, '..', '..', 'data', 'evidence');
if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function refang(url) {
  return url
    .replace(/^hxxp/i, 'http')
    .replace(/\[\.\]/g, '.')
    .replace(/\[:\]/g, ':');
}

// Chụp screenshot + lưu HTML snapshot (để có bằng chứng dạng text, phòng khi
// site bị gỡ trước khi review viên bên engine kiểm tra ảnh).
async function capture(report) {
  const log = logger.forReport(report);
  const target = refang(report.url);
  const fileBase = `report_${report.id}_${Date.now()}`;
  const screenshotPath = path.join(EVIDENCE_DIR, `${fileBase}.png`);
  const htmlPath = path.join(EVIDENCE_DIR, `${fileBase}.html`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    // Site lừa đảo hay chặn theo user-agent lạ, giả UA trình duyệt thường
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    log.info('navigating to capture evidence', { target });
    // domcontentloaded (không phải networkidle) -> không cần đợi mạng im hẳn,
    // tránh timeout dài với site có tracking/ads chạy ngầm liên tục.
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Chờ thêm chút để giao diện kịp render (không đợi network) rồi chụp luôn.
    await page.waitForTimeout(1500);
    // fullPage: false -> chỉ chụp đúng khung hình đầu tiên nhìn thấy, không cuộn hết trang
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf-8');
    log.info('evidence captured', { screenshotPath });
  } catch (err) {
    // Site sập / timeout vẫn nên chụp được gì có gì, không throw để không chặn cả report
    log.warn('capture failed, saving whatever loaded', { error: err.message });
    try { await page.screenshot({ path: screenshotPath, fullPage: false }); } catch (_) { /* trang trắng cũng được */ }
  } finally {
    await browser.close();
  }

  return {
    screenshotPath: path.relative(path.join(__dirname, '..', '..'), screenshotPath),
    htmlPath: path.relative(path.join(__dirname, '..', '..'), htmlPath),
  };
}

module.exports = { capture, refang };