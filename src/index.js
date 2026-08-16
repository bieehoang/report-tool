// src/index.js
// Gắn 3 mảnh core lại với nhau + expose REST API để admin/index.html gọi thật
// (thay vì mảng REPORTS giả trong <script> hiện tại), cộng với 1 worker loop
// chạy nền để tự động xử lý report ở trạng thái 'pending'.
//
// Cài đặt: npm install express better-sqlite3 playwright cors

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const queue = require('./core/queue');
const evidence = require('./core/evidence');
const logger = require('./core/logger');
const apiEngine = require('./core/engines/apiEngine');
const formEngine = require('./core/engines/formEngine');

const ENGINES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'engines.json'), 'utf-8')
);

const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS || 5000);

// ---------------------------------------------------------------------------
// Engine adapters — dispatch theo type, logic thật nằm trong src/core/engines/*
// ---------------------------------------------------------------------------
async function submitToEngine(report, engineId, engineDef, evidencePaths) {
  const log = logger.forReport(report);

  if (engineDef.type === 'api') {
    return apiEngine.submit(report, engineId, engineDef, evidencePaths);
  }

  if (engineDef.type === 'form') {
    return formEngine.start(report, engineId, engineDef, evidencePaths);
  }

  if (engineDef.type === 'email') {
    // TODO: chưa làm ở vòng này — soạn email đính kèm evidencePaths.screenshotPath, gửi qua SMTP
    log.info('TODO: send email engine (chưa triển khai)');
    return { ok: true, needsCaptcha: false };
  }

  throw new Error(`Unknown engine type: ${engineDef.type}`);
}

// ---------------------------------------------------------------------------
// Worker loop: mỗi WORKER_INTERVAL_MS lấy 1 report pending, xử lý, rồi ngủ tiếp
// ---------------------------------------------------------------------------
let workerBusy = false;

async function workerTick() {
  if (workerBusy) return;
  const report = queue.nextPending();
  if (!report) return;

  workerBusy = true;
  const log = logger.forReport(report);

  try {
    queue.setStatus(report.id, 'in_progress');

    const engineDef = ENGINES[report.engine_id];
    if (!engineDef) throw new Error(`No config for engine ${report.engine_id}`);

    log.info('capturing evidence');
    const evidencePaths = await evidence.capture(report);

    const result = await submitToEngine(report, report.engine_id, engineDef, evidencePaths);

    if (!result.ok && !result.needsCaptcha) {
      throw new Error(result.error || 'Engine reported failure');
    }

    if (result.needsCaptcha) {
      queue.setStatus(report.id, 'needs_captcha', {
        evidencePath: evidencePaths.screenshotPath,
        pauseNote: result.phaseLabel || null,
      });
      log.info('paused for manual step', { phase: result.phaseLabel });
    } else if (result.ok) {
      queue.setStatus(report.id, 'submitted', { evidencePath: evidencePaths.screenshotPath });
      log.info('submitted successfully');
    } else {
      throw new Error('Engine reported failure');
    }
  } catch (err) {
    queue.setStatus(report.id, 'failed', { failReason: err.message });
    log.error('processing failed', { error: err.message });
  } finally {
    workerBusy = false;
  }
}

// ---------------------------------------------------------------------------
// API cho admin/index.html
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/reports', (req, res) => {
  const { status, category, engine, search } = req.query;
  res.json(queue.list({ status, category, engineId: engine, search }));
});

app.get('/api/stats', (req, res) => {
  res.json(queue.counts());
});

app.get('/api/engines', (req, res) => {
  res.json(ENGINES);
});

app.post('/api/reports', (req, res) => {
  const { url, category, engineId } = req.body;
  if (!url || !category || !engineId) {
    return res.status(400).json({ error: 'url, category, engineId are required' });
  }
  if (!ENGINES[engineId]) {
    return res.status(400).json({ error: `Unknown engineId: ${engineId}` });
  }
  res.status(201).json(queue.add({ url, category, engineId }));
});

// Người dùng bấm "Đã giải xong" sau khi tự xử lý xong 1 bước thủ công (captcha,
// submit thật...). Với engine dạng form nhiều chặng, đây có thể chỉ là CHẠY TIẾP
// chặng kế tiếp (vẫn có thể dừng lại lần nữa ở 1 chặng thủ công khác), không
// nhất thiết đánh dấu 'submitted' ngay.
app.post('/api/reports/:id/resume', async (req, res) => {
  const id = Number(req.params.id);
  const report = queue.get(id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.status !== 'needs_captcha') {
    return res.status(400).json({ error: `Cannot resume from status ${report.status}` });
  }

  try {
    if (formEngine.hasOpenSession(id)) {
      const result = await formEngine.resume(report);
      if (!result.ok) {
        queue.setStatus(id, 'failed', { failReason: result.error });
      } else if (result.needsCaptcha) {
        // Còn ít nhất 1 chặng thủ công nữa -> vẫn needs_captcha, cập nhật hướng dẫn mới
        queue.setStatus(id, 'needs_captcha', { pauseNote: result.phaseLabel || null });
      } else {
        queue.setStatus(id, 'submitted', { pauseNote: null });
      }
    } else {
      // Không có browser session mở (vd engine loại API, hoặc server vừa restart
      // nên mất session cũ) -> giữ hành vi cũ: coi như người dùng tự lo xong rồi
      queue.setStatus(id, 'submitted', { pauseNote: null });
    }
    res.json(queue.get(id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/reports/:id/retry', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await formEngine.forceClose(id); // dọn browser cũ đang mở dở (nếu có) trước khi requeue
    res.json(queue.retry(id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`report-tool API listening on :${PORT}`);
  setInterval(workerTick, WORKER_INTERVAL_MS);
  logger.info(`worker loop started, interval ${WORKER_INTERVAL_MS}ms`);
});