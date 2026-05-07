const crypto = require('crypto');
const querystring = require('querystring');

/**
 * 綠界 OrderResultURL 處理
 * - 綠界付款完成後，瀏覽器 POST 到此
 * - 驗簽後轉跳到 payment-result.html?... (GET)
 * - 讓靜態頁面能正確讀取結果
 */

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.redirect('/payment-result.html');
  }

  try {
    const rawBody = await getRawBody(req);
    const params  = querystring.parse(rawBody);

    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV  = process.env.ECPAY_HASH_IV;

    // 驗簽（選擇性，失敗就直接顯示失敗頁）
    let verified = false;
    if (hashKey && hashIV) {
      const expected = buildCheckMacValue(params, hashKey, hashIV);
      verified = params.CheckMacValue === expected;
    }

    const rtnCode = params.RtnCode || '0';
    const tradeNo = params.MerchantTradeNo || '';
    const tradeAmt = params.TradeAmt || '';
    const paidAt  = params.PaymentDate || '';
    const rtnMsg  = params.RtnMsg || '';

    // 轉跳到靜態結果頁，帶上 GET 參數
    const qs = new URLSearchParams({
      RtnCode: rtnCode,
      MerchantTradeNo: tradeNo,
      TradeAmt: tradeAmt,
      PaymentDate: paidAt,
      RtnMsg: rtnMsg,
    }).toString();

    return res.redirect(`/payment-result.html?${qs}`);

  } catch (err) {
    console.error('[payment-result]', err);
    return res.redirect('/payment-result.html?RtnCode=0&RtnMsg=Error');
  }
};

handler.config = { api: { bodyParser: false } };
module.exports = handler;

// ── 工具 ────────────────────────────────────────────────
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
