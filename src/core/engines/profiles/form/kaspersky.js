// src/core/engines/profiles/form/kaspersky.js
// Lấy từ Playwright Codegen thật trên https://opentip.kaspersky.com/?tab=lookup (2026-08).
//
// KHÔNG có captcha ở luồng này (khớp requires_captcha: false trong config) và
// đã xác nhận đủ locator tới tận nút Submit cuối -> chỉ cần 1 phase tự động
// duy nhất, KHÔNG có phase manual nào. Nghĩa là engine này chạy 100% tự động,
// tự gửi report thật ngay khi worker xử lý tới report dùng engine 'kaspersky'
// — không có bước dừng nào để bạn xem lại trước khi gửi.
//
// Luồng: điền URL cần tra -> tick "private submission" -> Enter để phân tích
// -> mở modal VirLab (report to Kaspersky) -> điền email + mô tả -> gửi.
//
// Cần env REPORT_CONTACT_EMAIL (giống brightcloud.js) trong .env.

const { refang } = require('../../../evidence');
const { buildDescription } = require('../../../reportText');

module.exports = {
  phases: [
    {
      manual: false,
      async run(page, report) {
        const contactEmail = process.env.REPORT_CONTACT_EMAIL;
        if (!contactEmail) {
          throw new Error('Thiếu env REPORT_CONTACT_EMAIL — cần set trong .env để dùng engine kaspersky');
        }

        const reportedUrl = refang(report.url);

        await page.getByTestId('lookup-text-input').fill(reportedUrl);
        await page.getByTestId('checkbox-lookup-private-submission').check();
        await page.getByTestId('lookup-text-input').press('Enter');

        // Kaspersky cần thời gian phân tích URL trước khi nút mở modal xuất hiện
        // -> tăng timeout thay vì dùng mặc định 30s, tránh fail oan do phân tích chậm.
        await page.getByTestId('open-virlab-modal').click({ timeout: 60000 });

        await page.getByTestId('virlab-email-input').fill(contactEmail);
        await page.getByTestId('virlab-text-input').fill(buildDescription(report));
        await page.getByTestId('virlab-send').click();
      },
    },
  ],
};