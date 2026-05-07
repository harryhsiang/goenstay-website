const crypto = require('crypto');
const querystring = require('querystring');

// ── 停用 Vercel 預設 body parser（綠界傳 URL-encoded，需手動解析）──
const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('0|MethodNotAllowed');
  }

  try {
    // 手動讀取 raw body
    const rawBody = await getRawBody(req);
    const params  = querystring.parse(rawBody);

    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV  = process.env.ECPAY_HASH_IV;

    if (!hashKey || !hashIV) {
      console.error('[payment-notify] 缺少 Hash 環境變數');
      return res.status(200).send('0|MissingConfig');
    }

    // ── 驗簽 ────────────────────────────────────────────
    const expected = buildCheckMacValue(params, hashKey, hashIV);
    if (params.CheckMacValue !== expected) {
      console.warn('[payment-notify] 簽章驗證失敗', {
        received: params.CheckMacValue, expected,
      });
      return res.status(200).send('0|SignatureError');
    }

    // ── 付款成功 ─────────────────────────────────────────
    if (params.RtnCode === '1') {
      console.log('[payment-notify] 付款成功:', params.MerchantTradeNo);

      const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
      if (makeWebhookUrl) {
        try {
          await fetch(makeWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderNo:      params.MerchantTradeNo,
              tradeNo:      params.TradeNo,
              amount:       params.TradeAmt,
              paidAt:       params.PaymentDate,
              paymentType:  params.PaymentType,
              name:         safeDecodeURI(params.CustomField1 || ''),
              phone:        params.CustomField2 || '',
              datetime:     safeDecodeURI(params.CustomField3 || ''),
              pkgName:      safeDecodeURI(params.CustomField4 || ''),
              status:       '已確認',
              paymentStatus:'已全額付清',
            }),
          });
        } catch (e) {
          console.error('[payment-notify] Make webhook 失敗:', e.message);
        }
      }
    } else {
      console.log('[payment-notify] 付款未成功:', params.RtnCode, params.RtnMsg);
    }

    // 綠界要求一定要回傳 1|OK
    return res.status(200).send('1|OK');

  } catch (err) {
    console.error('[payment-notify] 錯誤:', err);
    return res.status(200).send('1|OK'); // 避免綠界重試
  }
};

// 停用 Vercel 預設 body parser
handler.config = {
  api: { bodyParser: false },
};

module.exports = handler;

// ── 工具函式 ────────────────────────────────────────────
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
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

function safeDecodeURI(str) {
  try { return decodeURIComponent(str); } catch { return str; }
}
