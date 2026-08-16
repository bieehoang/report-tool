// src/core/reportText.js
// Văn bản mô tả (description/note) dùng chung khi submit report tới các engine.
// Đổi câu chữ ở ĐÚNG 1 CHỖ này, mọi profile trong profiles/form/ và
// profiles/api/ dùng buildDescription() đều tự động cập nhật theo, không cần
// sửa từng file riêng lẻ.

function buildDescription(report) {
  return `I am reporting a malicious phishing website that uses redirect techniques to deceive users.
The site distributes URLs containing tracking or key parameters. After a user interacts with the page, they are redirected to another domain, likely to conceal fraudulent activity and evade security detection.
This method may be used to harvest login credentials or personal information. Immediate investigation is recommended.`;
}

module.exports = { buildDescription };