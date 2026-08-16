// src/core/engines/profiles/form/google_safe_browsing.js
// Lấy từ Playwright Codegen thật trên
// https://www.google.com/safebrowsing/report_phish/ (2026-08).
// Thứ tự: điền form (dropdown 2 tầng + url + note) trước -> submit ở cuối.
//
// Lưu ý: selector '.mat-mdc-select-placeholder' cho dropdown thứ 2 (Angular
// Material) khá chung chung — nếu autofill chọn nhầm phần tử, codegen lại và
// thay bằng locator cụ thể hơn.
//
// Tên file PHẢI khớp key 'google_safe_browsing' trong config/engines.json.

const { refang } = require('../../../evidence');
const { buildDescription } = require('../../../reportText');

module.exports = {
  phases: [
    {
      manual: false,
      async run(page, report) {
        await page.getByRole('combobox', { name: 'Threat Type' }).click();
        await page.getByText('Social Engineering', { exact: true }).click();
        await page.locator('.mat-mdc-select-placeholder').click();
        await page.getByText('Other Phishing').click();

        const reportedUrl = refang(report.url);
        await page.getByRole('textbox', { name: 'URL to report' }).fill(reportedUrl);
        await page.getByRole('textbox', { name: 'Additional details' }).fill(buildDescription(report));
      },
    },
    {
      manual: true,
      label: 'Giải captcha (nếu có) rồi tự bấm Submit thật trên trang Google',
    },
  ],
};