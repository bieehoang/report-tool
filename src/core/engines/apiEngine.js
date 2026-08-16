// src/core/engines/apiEngine.js
// Xử lý engine config.type === 'api'. Logic riêng từng engine nằm ở
// profiles/api/<engineId>.js — file này chỉ lo phần chung: gọi fetch, log, xử lý lỗi.
// Thêm/sửa 1 engine KHÔNG cần đụng file này, chỉ cần thêm/sửa file trong profiles/api/.

const logger = require('../logger');
const { loadApiProfiles } = require('./profiles');

const PROFILES = loadApiProfiles();

async function submit(report, engineId, engineDef) {
  const log = logger.forReport(report);
  const profile = PROFILES[engineId];
  if (!profile) {
    throw new Error(`Chưa có API profile cho engine '${engineId}' — tạo file src/core/engines/profiles/api/${engineId}.js`);
  }

  const req = profile.buildRequest(report, engineDef);
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