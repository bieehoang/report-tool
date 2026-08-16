// src/core/engines/profiles/form/brightcloud.js
// Lấy từ Playwright Codegen thật trên
// https://support.threatintel.opentext.com/tools/url-ip-lookup.php (2026-08).
//
// QUAN TRỌNG: endpoint trong config/engines.json đang trỏ về
// https://www.brightcloud.com/tools/url-ip-lookup.php (cũ) — cần cập nhật lại
// thành URL ở trên (BrightCloud giờ thuộc OpenText), nếu không formEngine.js
// sẽ mở nhầm trang cũ/redirect.
//
// Luồng có 2 captcha riêng biệt (loại chọn ảnh, không tự giải được):
//   1) Captcha ở bước tra cứu category hiện tại của domain
//   2) Captcha ở bước submit yêu cầu đổi category
// -> 4 chặng: điền domain -> [dừng] giải captcha 1 -> tự bấm Look up + mở form
//    đổi category + điền -> [dừng] giải captcha 2 + tự bấm Submit thật.
//
// Form yêu cầu email liên hệ — lấy từ env REPORT_CONTACT_EMAIL, cần set trong .env
// nếu muốn dùng engine này (không hardcode email cá nhân vào code).

const { refang } = require('../../../evidence');
const { buildDescription } = require('../../../reportText');

function extractDomain(url) {
  try {
    return new URL(refang(url)).hostname;
  } catch {
    // URL không parse được (thiếu scheme...) -> trả nguyên bản, để form tự báo lỗi rõ ràng
    return refang(url);
  }
}

module.exports = {
  phases: [
    {
      manual: false,
      async run(page, report) {
        await page.locator('#searchBox').fill(extractDomain(report.url));
      },
    },
    {
      manual: true,
      label: 'Giải captcha (bước 1/2 — tra cứu category hiện tại), bấm Verify trong captcha rồi bấm "Đã giải xong" ở đây',
    },
    {
      manual: false,
      async run(page, report) {
        const contactEmail = process.env.REPORT_CONTACT_EMAIL;
        if (!contactEmail) {
          throw new Error('Thiếu env REPORT_CONTACT_EMAIL — cần set trong .env để dùng engine brightcloud');
        }
        await page.getByRole('button', { name: 'Look up' }).click();
        await page.getByRole('link', { name: 'Request a category change' }).click();
        await page.locator('#email').fill(contactEmail);
        await page.locator('#productIntegration').fill(report.target_org || 'N/A');
        await page.locator('#concern').fill(buildDescription(report));
      },
    },
    {
      manual: true,
      label: 'Giải captcha (bước 2/2 — trước khi submit yêu cầu đổi category), rồi tự bấm Submit thật',
    },
  ],
};