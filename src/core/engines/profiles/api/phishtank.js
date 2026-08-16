// src/core/engines/profiles/api/phishtank.js
// TODO: endpoint checkurl.phishtank.com trong config hiện là API *kiểm tra*,
// không phải API *submit report mới*. Submit phish mới trên PhishTank thực tế
// cần đăng nhập tài khoản qua form web (không có API công khai ổn định).
// -> Cân nhắc chuyển sang profiles/form/phishtank.js (codegen như eset) thay
// vì để ở đây, hoặc bỏ qua engine này nếu không có cách submit chính thức.

module.exports = {
  buildRequest() {
    throw new Error('phishtank: submit API chưa được xác nhận — xem TODO trong profiles/api/phishtank.js');
  },
};