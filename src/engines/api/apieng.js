// src/core/engines/apiEngine.js
// Xử lý các engine config.type === 'api' (vd: phishtank, urlhaus).
// Mỗi engine cần 1 "builder" tự soạn request (method/url/headers/body) theo
// đúng format của service đó, vì mỗi nơi một kiểu.
//
// QUAN TRỌNG: payload/headers dưới đây là khung mẫu dựa trên tài liệu công khai
// tại thời điểm mình biết — nhiều service đã siết lại yêu cầu API key / rate
// limit theo thời gian. Trước khi chạy thật, hãy:
//   1. Đăng ký tài khoản/API key nếu service yêu cầu (đặt vào .env, KHÔNG hardcode)
//   2. Đối chiếu lại field name + response format với docs hiện tại của họ
//   3. Test với 1 URL biết trước để chắc chắn request được service chấp nhận
//
// Cần Node 18+ (có global fetch sẵn), nếu không thì: npm install node-fetch

const logger = require('../logger');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} — cần set trước khi dùng engine này`);
  return v;
}

// Mỗi builder trả về { url, method, headers, body } sẵn sàng đưa vào fetch()
const REQUEST_BUILDERS = {
  urlhaus(report, engineDef, evidencePaths) {
    // TODO xác nhận lại: URLhaus hiện yêu cầu header 'Auth-Key' cho endpoint submit.
    // Lấy key tại https://auth.abuse.ch/ rồi set env URLHAUS_AUTH_KEY.
    return {
      url: engineDef.endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Auth-Key': requireEnv('URLHAUS_AUTH_KEY'),
      },
      body: new URLSearchParams({ url: report.url_refanged || report.url }),
    };
  },

  phishtank(report, engineDef, evidencePaths) {
    // TODO: endpoint checkurl.phishtank.com trong config hiện là API *kiểm tra*,
    // không phải API *submit report mới*. Việc submit phish mới trên PhishTank
    // thực tế cần đăng nhập tài khoản qua form web (không có API công khai ổn định).
    // -> Cân nhắc chuyển phishtank sang formEngine thay vì apiEngine, hoặc bỏ qua
    // engine này nếu không có cách submit tự động chính thức.
    throw new Error('phishtank: submit API chưa được xác nhận, cần review lại — xem TODO trong apiEngine.js');
  },
};

async function submit(report, engineId, engineDef, evidencePaths) {
  const log = logger.forReport(report);
  const builder = REQUEST_BUILDERS[engineId];
  if (!builder) {
    throw new Error(`Chưa có API adapter cho engine '${engineId}'`);
  }

  const req = builder(report, engineDef, evidencePaths);
  log.info('calling API engine', { url: req.url, method: req.method });

  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });

  const text = await res.text();

  if (!res.ok) {
    log.error('API engine returned error', { status: res.status, body: text.slice(0, 300) });
    return { ok: false, needsCaptcha: false, error: `HTTP ${res.status}` };
  }

  log.info('API engine accepted submission', { status: res.status });
  return { ok: true, needsCaptcha: false, raw: text };
}

module.exports = { submit };