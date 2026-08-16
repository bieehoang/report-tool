// src/core/engines/profiles/form/vipre.js
// Lấy từ Playwright Codegen thật trên
// https://helpdesk.vipre.com/hc/en-us/requests/new?ticket_form_id=12049841584401 (2026-08).
//
// Form dùng Zendesk, có field ĐỘNG: chọn "Request Type" = 'Website
// Reclassification' trước sẽ làm hiện thêm field khác (I am a / Type / URL /
// Attachments) — phải chọn đúng thứ tự, không thể điền các field sau trước.
//
// TODO/RỦI RO: locator mở dropdown "Request Type" hiện dựa vào TEXT của giá
// trị mặc định đang hiển thị lúc codegen ('Report a False Negative'). Nếu tài
// khoản/session khác có giá trị mặc định khác, dòng này sẽ không tìm thấy
// phần tử -> phase fail. Nếu gặp lỗi ở đúng bước này, cần codegen lại để lấy
// locator ổn định hơn (vd theo aria-label field thay vì theo text giá trị).
//
// Không có captcha (requires_captcha: false) -> 1 phase tự động, auto-submit.

const path = require('path');
const { refang } = require('../../../evidence');
const { buildDescription } = require('../../../reportText');

module.exports = {
  phases: [
    {
      manual: false,
      async run(page, report, engineDef, evidencePaths) {
        const contactEmail = process.env.REPORT_CONTACT_EMAIL;
        if (!contactEmail) {
          throw new Error('Thiếu env REPORT_CONTACT_EMAIL — cần set trong .env để dùng engine vipre');
        }

        const reportedUrl = refang(report.url);

        // 1. Request Type -> 'Website Reclassification' (làm hiện thêm field bên dưới)
        await page.locator('a').filter({ hasText: 'Report a False Negative' }).click();
        await page.getByRole('option', { name: 'Website Reclassification' }).click();

        // 2. Email + Subject
        await page.getByRole('textbox', { name: 'Your email address*' }).fill(contactEmail);
        await page.getByRole('textbox', { name: 'Subject*' }).fill(
          `Urgent: Malicious Redirect-Based Phishing Campaign — ${reportedUrl}`
        );

        // 3. "I am a" -> cố định 'Not a VIPRE Customer'
        await page.getByLabel('I am a').nth(1).click();
        await page.getByRole('option', { name: 'Not a VIPRE Customer' }).click();

        // 4. Type -> cố định 'False Negative' (đúng ý nghĩa: báo site chưa bị VIPRE nhận diện)
        await page.locator('a').filter({ hasText: /^-$/ }).click();
        await page.getByRole('option', { name: 'False Negative' }).click();

        // 5. URL / Website — field riêng, khác Subject
        await page.getByRole('textbox', { name: 'URL / Website*' }).fill(reportedUrl);

        // 6. Description (rich-text editor trong iframe)
        const editor = page.locator('iframe[title="null"]').contentFrame().getByRole('textbox', { name: 'null' });
        await editor.click();
        await editor.fill(buildDescription(report));

        // 7. Đính kèm evidence — locator này là <input type=file> ẩn dưới nút, đã xác nhận hoạt động
        if (evidencePaths?.screenshotPath) {
          const absPath = path.join(__dirname, '..', '..', '..', '..', '..', evidencePaths.screenshotPath);
          await page.getByRole('button', { name: 'Attachments(optional)' }).setInputFiles(absPath);
        }

        // 8. Submit (xác nhận locator từ lần codegen trước, lần này bạn cố tình chưa bấm để tránh gửi thật lúc test)
        await page.getByRole('button', { name: 'Submit' }).click();
      },
    },
  ],
};