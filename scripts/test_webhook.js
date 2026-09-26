/**
 * Test Webhook Dispatcher
 * Sends a single checklist item update to the webhook to test end-to-end automation.
 *
 * Usage:
 *   node scripts/test_webhook.js
 *   node scripts/test_webhook.js --phone 919798637485 --item "GRN image upload optimization" --checked true
 */

const https = require('https');
const http = require('http');

const DEFAULT_WEBHOOK_URL = process.env.CHECKLIST_WEBHOOK_URL || 'https://footpath-election-catapult.ngrok-free.dev/webhook/erp-architecture-review-update';
const BOSS_NUMBER_1 = '919798637485';

// Parse command line arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return defaultValue;
}

const webhookUrl = getArg('url', DEFAULT_WEBHOOK_URL);
const recipientPhone = getArg('phone', BOSS_NUMBER_1);
const sectionTitle = getArg('section', 'ERP Performance & Reliability');
const itemTitle = getArg('item', 'GRN image upload optimization');
const checked = getArg('checked', 'true') === 'true';
const note = getArg('note', 'Test notification with Boss Number 1');
const updatedBy = getArg('updatedBy', 'Satyam');

const payload = {
  eventType: 'checklist_update',
  sectionTitle,
  itemTitle,
  checked,
  note,
  updatedBy,
  recipientPhoneNumber: recipientPhone,
  timestamp: new Date().toISOString(),
  checklistUrl: 'https://swift-erp-architecture-review-ddlqd6zew.vercel.app/'
};

console.log('='.repeat(70));
console.log('SENDING CHECKLIST UPDATE TO WEBHOOK');
console.log('='.repeat(70));
console.log('Webhook URL :', webhookUrl);
console.log('Recipient   :', recipientPhone);
console.log('Payload     :', JSON.stringify(payload, null, 2));
console.log('-'.repeat(70));

const postData = JSON.stringify(payload);
const parsedUrl = new URL(webhookUrl);
const isHttps = parsedUrl.protocol === 'https:';
const client = isHttps ? https : http;

const options = {
  hostname: parsedUrl.hostname,
  port: parsedUrl.port || (isHttps ? 443 : 80),
  path: parsedUrl.pathname + parsedUrl.search,
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain;charset=UTF-8',
    'Content-Length': Buffer.byteLength(postData)
  },
  timeout: 15000
};

const req = client.request(options, (res) => {
  let responseBody = '';

  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log(`HTTP Status : ${res.statusCode} ${res.statusMessage}`);
    console.log('Response Body:');
    try {
      const parsed = JSON.parse(responseBody);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(responseBody || '(empty body)');
    }
    console.log('='.repeat(70));

    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ Webhook request accepted successfully by n8n.');
    } else {
      console.warn(`⚠️ Webhook returned HTTP ${res.statusCode}.`);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request error:', err.message);
  console.log('='.repeat(70));
});

req.on('timeout', () => {
  req.destroy();
  console.error('❌ Request timed out after 15 seconds.');
  console.log('='.repeat(70));
});

req.write(postData);
req.end();
