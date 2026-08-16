// src/core/engines/profiles/form/lionic.js
// Lấy từ Playwright Codegen thật trên https://www.lionic.com/query/?url= (2026-08).
//
// Luồng mở 1 CỬA SỔ POPUP riêng khi click "Free URL Check" — mọi thao tác sau
// đó (tra cứu, điền form report) đều nằm trên popup, không phải tab gốc.
// Không có captcha (requires_captcha: false) -> 1 phase tự động, auto-submit.
//
// Cần thêm REPORT_CONTACT_NAME trong .env (tên hiển thị ở field "Reporter
// Name"), nếu không set sẽ dùng mặc định 'Anti-Scam Ops'.

const { refang } = require('../../../evidence');
const { buildDescription } = require('../../../reportText');

module.exports = {
  phases: [
    {
      manual: false,
      async run(page, report) {
        const reporterEmail = process.env.REPORT_CONTACT_EMAIL;
        if (!reporterEmail) {
          throw new Error('Thiếu env REPORT_CONTACT_EMAIL — cần set trong .env để dùng engine lionic');
        }
        const reporterName = process.env.REPORT_CONTACT_NAME || 'Anti-Scam Ops';
        const reportedUrl = refang(report.url);

        // Mở popup và chuyển làm việc sang đó
        const popupPromise = page.waitForEvent('popup');
        await page.getByRole('link', { name: 'Free URL Check' }).first().click();
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');

        // Bước 1: tra cứu URL trước (theo đúng luồng thật của trang)
        await popup.getByRole('textbox', { name: 'Search a URL' }).fill(reportedUrl);
        await popup.locator('#check_submit').click();

        // Bước 2: mở form report từ link "nếu chưa đúng, report tại đây"
        await popup.getByRole('link', { name: 'If not OK, please visit "' }).click();

        // Bước 3: điền form report
        await popup.getByRole('textbox', { name: 'Reporter Name' }).fill(reporterName);
        await popup.getByRole('textbox', { name: 'Reporter Email Address *' }).fill(reporterEmail);
        await popup.getByRole('textbox', { name: 'False Positive URL *' }).fill(reportedUrl);
        await popup.getByRole('textbox', { name: 'Subject *' }).fill(
          `Urgent: Malicious Redirect-Based Phishing Campaign — ${reportedUrl}`
        );
        await popup.getByRole('textbox', { name: 'Message *' }).fill(buildDescription(report));
        await popup.getByRole('checkbox', { name: 'I have read and agree with' }).check();
        await popup.getByRole('button', { name: 'Submit Only' }).click();
      },
    },
  ],
};