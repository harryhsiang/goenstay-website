const crypto = require('crypto');

// ── 綠界 CheckMacValue（SHA256）────────────────────────────
function buildCheckMacValue(params, hashKey, hashIV) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );
  const sortedKeys = Object.keys(filtered).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  let raw = `HashKey=${hashKey}`;
  for (const k of sortedKeys) raw += `&${k}=${filtered[k]}`;
  raw += `&HashIV=${hashIV}`;

  let encoded = encodeURIComponent(raw).toLowerCase();
  encoded = encoded
    .replace(/%2d/g, '-').replace(/%5f/g, '_').replace(/%2e/g, '.')
    .replace(/%21/g, '!').replace(/%2a/g, '*')
    .replace(/%28/g, '(').replace(/%29/g, ')').replace(/%20/g, '+');

  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

function getTaiwanDateStr() {
  const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const p = n => String(n).padStart(2, '0');
  return `${tw.getFullYear()}/${p(tw.getMonth()+1)}/${p(tw.getDate())} ${p(tw.getHours())}:${p(tw.getMinutes())}:${p(tw.getSeconds())}`;
}

function genTradeNo() {
  const tw = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const p = n => String(n).padStart(2, '0');
  return `BK${String(tw.getFullYear()).slice(2)}${p(tw.getMonth()+1)}${p(tw.getDate())}${p(tw.getHours())}${p(tw.getMinutes())}${p(tw.getSeconds())}`;
}

// ── Vercel Serverless Function ────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // Vercel 自動解析 application/json body
    const {
      name, phone, lineId,
      pkgName, date, startTime, endTime,
      duration, people, amount, notes,
    } = req.body;

    // ── 環境變數 ──────────────────────────────────────────
    const merchantID = process.env.ECPAY_MERCHANT_ID;
    const hashKey    = process.env.ECPAY_HASH_KEY;
    const hashIV     = process.env.ECPAY_HASH_IV;
    const isStage    = process.env.ECPAY_STAGE !== 'false';

    if (!merchantID || !hashKey || !hashIV) {
      throw new Error('缺少綠界環境變數，請至 Vercel → Settings → Environment Variables 設定');
    }

    // ── 從 request headers 自動取得網站網址 ───────────────
    const proto   = req.headers['x-forwarded-proto'] || 'https';
    const host    = req.headers.host;
    const siteUrl = `${proto}://${host}`;

    // ── 訂單資料 ──────────────────────────────────────────
    const tradeNo   = genTradeNo();
    const tradeDate = getTaiwanDateStr();
    const totalAmt  = Math.round(Number(amount));
    const itemName  = `${pkgName} ${date} ${startTime}-${endTime}`;
    const tradeDesc = `有緣居共享空間-${pkgName}`;

    const params = {
      MerchantID:        merchantID,
      MerchantTradeNo:   tradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType:       'aio',
      TotalAmount:       String(totalAmt),
      TradeDesc:         tradeDesc,
      ItemName:          itemName,
      ReturnURL:         `${siteUrl}/api/payment-notify`,
      OrderResultURL:    `${siteUrl}/api/payment-result`,
      ClientBackURL:     `${siteUrl}/booking.html`,
      ChoosePayment:     'Credit',
      EncryptType:       '1',
      CustomField1:      encodeURIComponent(name.slice(0, 20)),
      CustomField2:      phone.replace(/\D/g, '').slice(0, 20),
      CustomField3:      encodeURIComponent(`${date} ${startTime}-${endTime}`.slice(0, 50)),
      CustomField4:      encodeURIComponent(pkgName.slice(0, 50)),
    };

    params.CheckMacValue = buildCheckMacValue(params, hashKey, hashIV);

    const payUrl = isStage
      ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
      : 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

    const fields = Object.entries(params)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
      .join('\n    ');

    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>跳轉至綠界付款...</title>
  <style>
    body { font-family:'Noto Sans TC',sans-serif; background:#f5f0e8;
      display:flex; align-items:center; justify-content:center;
      height:100vh; flex-direction:column; gap:16px; }
    .spinner { width:44px; height:44px; border:3px solid #ddd0b8;
      border-top-color:#8a5c2e; border-radius:50%;
      animation:spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg)} }
    p { color:#5a5040; font-size:14px; letter-spacing:0.08em; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>正在跳轉至綠界付款頁面，請稍候...</p>
  <form id="f" action="${payUrl}" method="POST">
    ${fields}
  </form>
  <script>document.getElementById('f').submit();<\/script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (err) {
    console.error('[create-payment]', err);
    return res.status(500).json({ error: err.message });
  }
};
