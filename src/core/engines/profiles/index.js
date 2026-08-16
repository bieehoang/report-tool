// src/core/engines/profiles/index.js
// Tự động nạp mọi profile trong 1 thư mục (form/ hoặc api/). Tên file (không có
// .js) PHẢI khớp đúng key engine trong config/engines.json — đây là quy ước
// duy nhất cần nhớ khi thêm engine mới.
//
// Thêm engine mới = tạo 1 file mới trong profiles/form/ hoặc profiles/api/,
// KHÔNG cần sửa formEngine.js / apiEngine.js / index.js.

const fs = require('fs');
const path = require('path');

function loadProfiles(dir) {
  const profiles = {};
  if (!fs.existsSync(dir)) return profiles;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js') || file === 'index.js') continue;
    const engineId = path.basename(file, '.js');
    try {
      profiles[engineId] = require(path.join(dir, file));
    } catch (err) {
      // Không throw ở đây để 1 file lỗi cú pháp không sập cả server —
      // engine đó sẽ báo lỗi rõ ràng khi thật sự được gọi tới (xem formEngine/apiEngine).
      console.error(`[profiles] Lỗi nạp profile '${engineId}' từ ${file}:`, err.message);
    }
  }
  return profiles;
}

module.exports = {
  loadFormProfiles: () => loadProfiles(path.join(__dirname, 'form')),
  loadApiProfiles: () => loadProfiles(path.join(__dirname, 'api')),
};