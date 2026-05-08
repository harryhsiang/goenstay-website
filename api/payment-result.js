const crypto = require('crypto');
const querystring = require('querystring');

const handler = async (req, res) => {
  // GET 請求：直接顯示結果頁（從 query string 讀參數）
  if (req.method === 'GET') {
    const p = req.query || {};
    return res.status(200).send(renderPage(p));
  }

  // POST 請求：綠界 OrderResultURL 回傳
  if (req.method !== 'POST') {
    return res.status(200).send(renderPage({}));
  }

  try {
    const rawBody = await getRawBody(req);
    const params  = querystring.parse(rawBody);

    return res.status(200).send(renderPage(params));

  } catch (err) {
    console.error('[payment-result]', err);
    return res.status(200).send(renderPage({ RtnCode: '0', RtnMsg: 'Error' }));
  }
};

handler.config = { api: { bodyParser: false } };
module.exports = handler;

// ── 產生完整 HTML 頁面 ──────────────────────────────────────
function renderPage(p) {
  const rtnCode  = p.RtnCode  || '';
  const tradeNo  = p.MerchantTradeNo || p.TradeNo || '';
  const tradeAmt = p.TradeAmt  || '';
  const paidAt   = decodeURIComponent((p.PaymentDate || '').replace(/\+/g, ' '));
  const rtnMsg   = p.RtnMsg   || '';

  const isSuccess = rtnCode === '1';

  const rows = [
    tradeNo  ? row('訂單編號', tradeNo) : '',
    tradeAmt ? row('付款金額', 'NT$ ' + Number(tradeAmt).toLocaleString()) : '',
    paidAt   ? row('付款時間', paidAt) : '',
  ].join('');

  const icon      = isSuccess ? '✅' : (rtnCode ? '❌' : '📋');
  const iconClass = isSuccess ? 'success' : (rtnCode ? 'fail' : '');
  const title     = isSuccess ? '預約成功！' : (rtnCode ? '付款未完成' : '付款結果頁');
  const titleClass = isSuccess ? 'success' : (rtnCode ? 'fail' : '');
  const sub       = isSuccess
    ? '感謝你的預約，系統已收到付款。確認通知即將透過 LINE 發送，使用前 1 小時會再傳送門鎖密碼。'
    : (rtnCode
        ? '付款流程未完成或已取消，預約尚未成立。如有疑問請 LINE 私訊 @goenstay。'
        : '此頁面為付款完成後的跳轉目標，請透過預約流程前往付款。');

  const actions = isSuccess
    ? '<a href="/index.html" class="btn btn-primary">回到首頁</a><a href="/booking.html" class="btn btn-ghost">再次預約</a>'
    : (rtnCode
        ? '<a href="/booking.html" class="btn btn-primary">重新預約</a><a href="/index.html" class="btn btn-ghost">回首頁</a>'
        : '<a href="/booking.html" class="btn btn-primary">立即預約 →</a>');

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${isSuccess ? '預約成功' : '付款結果'} | 有緣居共享空間</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@300;400;500&family=Noto+Sans+TC:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{--oak:#8a5c2e;--oak-deep:#6a3e18;--oak-bg:#f5f0e8;--cream:#faf7f2;--border:#ddd0b8;--border-light:#ece2cf;--text:#3a3228;--text-soft:#5a5040;--muted:#8a7e6e;--green:#5a7a50;--shadow:0 4px 24px rgba(90,60,20,0.08)}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--oak-bg);font-family:'Noto Sans TC',sans-serif;color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
.card{background:var(--cream);border:1px solid var(--border);border-radius:20px;padding:clamp(28px,5vw,48px);max-width:480px;width:100%;text-align:center;box-shadow:var(--shadow)}
.icon-circle{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 20px}
.icon-circle.success{background:#e8f5e9}
.icon-circle.fail{background:#fef2f2}
.card-title{font-family:'Noto Serif TC',serif;font-size:clamp(20px,4vw,26px);font-weight:400;letter-spacing:0.06em;margin-bottom:8px}
.card-title.success{color:var(--green)}
.card-title.fail{color:#c0392b}
.card-sub{font-size:14px;color:var(--muted);line-height:1.9;margin-bottom:28px}
.info-box{background:var(--oak-bg);border:1px solid var(--border);border-radius:12px;padding:18px 20px;text-align:left;margin-bottom:24px}
.info-row{display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;font-size:13px;border-bottom:1px solid var(--border-light)}
.info-row:last-child{border-bottom:none}
.info-row .k{color:var(--muted);flex-shrink:0;margin-right:12px}
.info-row .v{color:var(--text);font-weight:500;text-align:right}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 28px;border-radius:30px;border:none;font-family:'Noto Sans TC',sans-serif;font-size:13px;font-weight:500;letter-spacing:0.1em;cursor:pointer;text-decoration:none;transition:all 0.2s;margin:4px}
.btn-primary{background:var(--oak);color:white}
.btn-primary:hover{background:var(--oak-deep);transform:translateY(-1px)}
.btn-ghost{background:none;border:1.5px solid var(--border);color:var(--text-soft)}
.btn-ghost:hover{border-color:var(--oak);color:var(--oak)}
</style>
</head>
<body>
<div class="card">
  <div class="icon-circle ${iconClass}">${icon}</div>
  <h1 class="card-title ${titleClass}">${title}</h1>
  <p class="card-sub">${sub}</p>
  ${rows ? '<div class="info-box">' + rows + '</div>' : ''}
  <div>${actions}</div>
</div>
</body>
</html>`;
}

function row(k, v) {
  return '<div class="info-row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function buildCheckMacValue(params, hashKey, hashIV) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );
  const sortedKeys = Object.keys(filtered).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  let raw = 'HashKey=' + hashKey;
  for (const k of sortedKeys) raw += '&' + k + '=' + filtered[k];
  raw += '&HashIV=' + hashIV;

  let encoded = encodeURIComponent(raw).toLowerCase();
  encoded = encoded
    .replace(/%2d/g, '-').replace(/%5f/g, '_').replace(/%2e/g, '.')
    .replace(/%21/g, '!').replace(/%2a/g, '*')
    .replace(/%28/g, '(').replace(/%29/g, ')').replace(/%20/g, '+');

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}
