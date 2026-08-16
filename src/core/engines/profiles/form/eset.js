// src/core/engines/profiles/form/eset.js
// Lấy từ Playwright Codegen thật trên https://phishing.eset.com/en-us/report (2026-08).
// Form KHÔNG có ô upload file. Thứ tự: điền form trước -> captcha ở cuối.
//
// Nếu ESET đổi cấu trúc form sau này: chạy lại
//   npx playwright codegen https://phishing.eset.com/en-us/report
// rồi sửa lại DUY NHẤT file này.

const { refang } = require('../../../evidence');
const { buildDescription } = require('../../../reportText');

module.exports = {
  phases: [
    {
      manual: false,
      async run(page, report) {
        const reportedUrl = refang(report.url);
        await page.getByRole('textbox', { name: 'Phishing URL*' }).fill(reportedUrl);
        if (report.target_org) {
          // Cột target_org chưa có trong schema hiện tại (xem queue.js) — thêm nếu cần dùng.
          await page.getByRole('textbox', { name: 'Organization targeted by' }).fill(report.target_org);
        }
        await page.getByRole('textbox', { name: 'Note' }).fill(buildDescription(report));
      },
    },
    {
      manual: true,
      label: 'Giải captcha "I\'m not a robot" rồi tự bấm Submit thật trên trang ESET',
    },
  ],
};