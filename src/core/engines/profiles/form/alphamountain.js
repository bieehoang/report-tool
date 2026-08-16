// src/core/engines/profiles/form/alphamountain.js
// Lấy từ Playwright Codegen thật trên https://alphamountain.freshdesk.com (2026-08).
//
// Trang dùng Freshdesk, YÊU CẦU ĐĂNG NHẬP trước khi tạo ticket. Credential lấy
// từ env FRESHDESK_EMAIL / FRESHDESK_PASSWORD — KHÔNG hardcode vào file này.
//
// Không có captcha ở luồng này (khớp requires_captcha: false trong config),
// có đủ locator tới tận nút Submit -> 1 phase tự động duy nhất, không dừng lần nào.
//
// Đính kèm ảnh evidence: Playwright KHÔNG ghi lại được thao tác chọn file qua
// hộp thoại hệ điều hành (native file picker) khi codegen -> thay vì click nút
// "Attachment" rồi phải xử lý dialog, ta trỏ THẲNG vào <input type="file"> ẩn
// phía sau bằng setInputFiles() — cách này ổn định hơn, không cần mở dialog.
// TODO: selector 'input[type="file"]' khá chung chung, nếu trang có nhiều input
// file khác sẽ chọn nhầm — nếu lỗi/đính kèm sai chỗ, cần F12 xác nhận lại
// đúng input đằng sau nút "Attachment".
//
// TODO: option category trong combobox "Suggest New Category" mới chỉ xác
// nhận chắc chắn có 'Phishing'. Với 'scam'/'gambling' cần kiểm tra lại tên option thật.

const path = require('path');
const { refang } = require('../../../evidence');
const { buildDescription } = require('../../../reportText');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu env ${name} — cần set trong .env để dùng engine alphamountain`);
  return v;
}

function categoryOptionLabel(category) {
  // 'phishing' -> 'Phishing' (đã xác nhận), 'scam'/'gambling' -> đoán theo cùng quy tắc, CHƯA xác nhận
  return category.charAt(0).toUpperCase() + category.slice(1);
}

module.exports = {
  phases: [
    {
      manual: false,
      async run(page, report, engineDef, evidencePaths) {
        const email = requireEnv('REPORT_CONTACT_EMAIL');
        const password = requireEnv('FRESHDESK_PASSWORD');

        // Nếu chưa đăng nhập, Freshdesk tự chuyển tới /support/login
        const loginEmailField = page.getByRole('textbox', { name: 'Your e-mail address' });
        if (await loginEmailField.isVisible().catch(() => false)) {
          await loginEmailField.fill(email);
          await page.getByRole('textbox', { name: 'Password' }).fill(password);
          await page.getByRole('button', { name: 'Login' }).click();
        }

        // Đảm bảo đang ở đúng form tạo ticket (login xong có thể không tự redirect đúng chỗ)
        const ticketUrl = engineDef.url || engineDef.endpoint;
        if (!page.url().includes('/support/tickets/new')) {
          await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' });
        }

        const reportedUrl = refang(report.url);

        await page.getByRole('textbox', { name: 'Subject' }).fill(
          `Urgent: Malicious Redirect-Based Phishing Campaign — ${reportedUrl}`
        );

        // Description dùng rich-text editor Froala. Editor thật gồm 2 phần tử:
        // 1 <textarea> ẨN (chỉ để submit form, mang aria-label giống hệt) và
        // 1 div contenteditable HIỂN THỊ (nơi thật sự gõ vào). getByRole role
        // "textbox" khớp nhầm vào textarea ẩn -> lỗi "element is not visible".
        // Trỏ thẳng vào div contenteditable hiển thị bên trong .fr-wrapper.
        const descriptionField = page.locator('.fr-wrapper [contenteditable="true"]');
        await descriptionField.click();
        await descriptionField.fill(buildDescription(report));

        await page.getByRole('textbox', { name: 'Disputed Website' }).fill(reportedUrl);

        await page.getByRole('combobox', { name: 'Suggest New Category for' }).click();
        const categoryLabel = categoryOptionLabel(report.category);
        await page.getByRole('textbox', { name: 'Choose...' }).fill(categoryLabel.slice(0, 4).toLowerCase());
        await page.getByRole('option', { name: categoryLabel }).click();

        // Đính kèm screenshot bằng chứng (nếu evidence.js chụp thành công).
        // Trang có 2 input[type=file]: #upload_file (input ẩn chỉ để JS trigger
        // dialog OS) và #files_list (field thật gắn với dữ liệu submit ticket,
        // tên helpdesk_ticket[attachments][][resource]) -> dùng đúng #files_list.
        if (evidencePaths?.screenshotPath) {
          const absPath = path.join(__dirname, '..', '..', '..', '..', '..', evidencePaths.screenshotPath);
          await page.locator('#files_list').setInputFiles(absPath);
        }

        await page.getByRole('button', { name: 'Submit' }).click();
      },
    },
  ],
};