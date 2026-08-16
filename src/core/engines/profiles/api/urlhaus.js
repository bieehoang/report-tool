// src/core/engines/profiles/api/urlhaus.js
// QUAN TRỌNG: đối chiếu lại với docs hiện tại của abuse.ch trước khi chạy thật
// (header/field name có thể đã đổi). Lấy Auth-Key tại https://auth.abuse.ch/

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} — cần set trước khi dùng engine này`);
  return v;
}

module.exports = {
  buildRequest(report, engineDef) {
    return {
      url: engineDef.endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Auth-Key': requireEnv('URLHAUS_AUTH_KEY'),
      },
      body: new URLSearchParams({ url: report.url }),
    };
  },
};