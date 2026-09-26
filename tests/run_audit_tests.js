/**
 * Automated Test Suite for ERP Architecture Review -> WhatsApp Automation
 * Covers Test 1 through Test 8 from requirements, plus edge cases & boss number verification.
 */

const assert = require('assert');
const {
  DEFAULT_CHECKLIST_URL,
  DEFAULT_BOSS_NUMBERS,
  TEMPLATE_NAME,
  TEMPLATE_LANG,
  parseWebhookPayload,
  validatePayload,
  formatISTTime,
  sanitizePhoneNumbers,
  buildMetaTemplatePayload,
  buildFreeformTextPayload,
  evaluateMetaApiResponse
} = require('../workflow/payload_validator');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${err.message}`);
    if (err.stack) console.error(`   Stack: ${err.stack.split('\n').slice(1, 3).join('\n')}`);
  }
}

console.log('='.repeat(70));
console.log('STARTING AUDIT VERIFICATION TEST SUITE');
console.log('='.repeat(70));

// =========================================================================
// TEST 1: One unchecked item (checked = false)
// =========================================================================
runTest('Test 1: One unchecked item (checked = false) triggers valid notification', () => {
  const payload = {
    eventType: 'checklist_update',
    sectionTitle: 'Architecture & Scalability',
    itemTitle: 'What is the current and expected workload?',
    checked: false,
    note: '',
    updatedBy: 'Satyam',
    timestamp: '2026-09-26T12:00:00.000Z'
  };

  const validated = validatePayload(payload);
  assert.strictEqual(validated.checked, false, 'checked should be false');
  assert.strictEqual(validated.itemTitle, 'What is the current and expected workload?');

  const templateReq = buildMetaTemplatePayload(validated, '919798637485');
  assert.strictEqual(templateReq.messaging_product, 'whatsapp');
  assert.strictEqual(templateReq.to, '919798637485');
  assert.strictEqual(templateReq.type, 'template');
  assert.strictEqual(templateReq.template.name, TEMPLATE_NAME);

  const params = templateReq.template.components[0].parameters;
  assert.strictEqual(params.length, 7, 'Should have exactly 7 parameters');
  assert.strictEqual(params[2].text, 'Unchecked / Pending', 'Status should reflect unchecked state');
  assert.strictEqual(params[3].text, 'None', 'Empty note should default to "None"');
});

// =========================================================================
// TEST 2: One checked item (checked = true)
// =========================================================================
runTest('Test 2: One checked item (checked = true) triggers valid notification', () => {
  const payload = {
    eventType: 'checklist_update',
    sectionTitle: 'Security & Access Control',
    itemTitle: 'What is the authentication architecture?',
    checked: true,
    note: 'JWT token rotation implemented',
    updatedBy: 'Satyam',
    timestamp: '2026-09-26T12:15:00.000Z'
  };

  const validated = validatePayload(payload);
  assert.strictEqual(validated.checked, true, 'checked should be true');

  const templateReq = buildMetaTemplatePayload(validated, '919798637485');
  const params = templateReq.template.components[0].parameters;
  assert.strictEqual(params[2].text, 'Reviewed / Done', 'Status should reflect reviewed state');
  assert.strictEqual(params[3].text, 'JWT token rotation implemented', 'Note should be included');
});

// =========================================================================
// TEST 3: Checked item with note
// =========================================================================
runTest('Test 3: Checked item with note includes note in WhatsApp template parameter {{4}}', () => {
  const payload = {
    eventType: 'checklist_update',
    sectionTitle: 'ERP Performance',
    itemTitle: 'GRN image upload optimization',
    checked: true,
    note: 'Direct S3 signed URL upload verified; client latency reduced to 180ms',
    updatedBy: 'Satyam Sharma',
    timestamp: '2026-09-26T12:30:00.000Z'
  };

  const validated = validatePayload(payload);
  const templateReq = buildMetaTemplatePayload(validated, '919798637485');
  const params = templateReq.template.components[0].parameters;

  assert.strictEqual(params[3].text, 'Direct S3 signed URL upload verified; client latency reduced to 180ms');
  assert.strictEqual(params[4].text, 'Satyam Sharma');
});

// =========================================================================
// TEST 4: Checked item without note
// =========================================================================
runTest('Test 4: Checked item without note succeeds and defaults to "None" (never empty string)', () => {
  const payload = {
    eventType: 'checklist_update',
    sectionTitle: 'Data Architecture & Integrity',
    itemTitle: 'What is the indexing strategy?',
    checked: true,
    // note is omitted completely
    updatedBy: 'Satyam'
  };

  const validated = validatePayload(payload);
  assert.strictEqual(validated.note, '', 'Parsed note should be empty string');

  const templateReq = buildMetaTemplatePayload(validated, '919798637485');
  const params = templateReq.template.components[0].parameters;
  // Meta API throws HTTP 400 parameter mismatch if any parameter text is empty string ""
  assert.notStrictEqual(params[3].text, '', 'Parameter {{4}} MUST NOT be empty string');
  assert.strictEqual(params[3].text, 'None', 'Parameter {{4}} should default to "None"');
});

// =========================================================================
// TEST 5: Different checklist item (item #20)
// =========================================================================
runTest('Test 5: Different checklist item (e.g. item #20) sends independent notification', () => {
  const payload = {
    eventType: 'checklist_update',
    sectionTitle: 'Reliability & Operational Resilience',
    itemTitle: 'How are failed background operations recovered?',
    checked: true,
    note: 'BullMQ dead letter queue configured with 5 max retries',
    updatedBy: 'DevOps Lead',
    itemId: '3-2'
  };

  const validated = validatePayload(payload);
  assert.strictEqual(validated.sectionTitle, 'Reliability & Operational Resilience');
  assert.strictEqual(validated.itemTitle, 'How are failed background operations recovered?');
  assert.strictEqual(validated.updatedBy, 'DevOps Lead');

  const templateReq = buildMetaTemplatePayload(validated, '919798637485');
  const params = templateReq.template.components[0].parameters;
  assert.strictEqual(params[0].text, 'Reliability & Operational Resilience');
  assert.strictEqual(params[1].text, 'How are failed background operations recovered?');
});

// =========================================================================
// TEST 6: Only one of the 42 checklist items exists/is updated
// =========================================================================
runTest('Test 6: Only ONE checklist item updated - automation succeeds (NO 42-item dependency)', () => {
  const singleItemPayload = {
    eventType: 'checklist_update',
    sectionTitle: 'DevOps, Deployment & Observability',
    itemTitle: 'What is the CI/CD process?',
    checked: true,
    note: 'GitHub Actions running lint and test suites on PR',
    updatedBy: 'Satyam'
  };

  // Ensure there is NO check requiring 42 items or allItemsCompleted
  const validated = validatePayload(singleItemPayload);
  assert.ok(validated, 'Single item validation must succeed immediately');
  assert.strictEqual(validated.itemTitle, 'What is the CI/CD process?');

  const templateReq = buildMetaTemplatePayload(validated, '919798637485');
  assert.ok(templateReq.template.components[0].parameters.length === 7);
});

// =========================================================================
// TEST 7: Invalid webhook payload handling
// =========================================================================
runTest('Test 7: Invalid webhook payload returns useful validation error, no WhatsApp dispatch', () => {
  // Scenario 7a: Missing itemTitle
  assert.throws(
    () => {
      validatePayload({ sectionTitle: 'Some Section', checked: true });
    },
    /itemTitle.*required/i,
    'Should throw error when itemTitle is missing'
  );

  // Scenario 7b: Invalid JSON string in text/plain
  assert.throws(
    () => {
      parseWebhookPayload('this is definitely not json');
    },
    /Failed to parse/i,
    'Should throw error when text/plain content cannot be parsed as JSON'
  );

  // Scenario 7c: Null payload
  assert.throws(
    () => {
      parseWebhookPayload(null);
    },
    /Empty payload/i,
    'Should throw error when payload is null'
  );
});

// =========================================================================
// TEST 8: Meta API failure handling
// =========================================================================
runTest('Test 8: Meta API failure handling exposes useful diagnostics without corrupting state', () => {
  // Scenario 8a: Customer care 24h window closed (error 131047)
  const meta24hErrorResponse = {
    error: {
      message: 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.',
      type: 'OAuthException',
      code: 131047,
      error_data: {
        messaging_product: 'whatsapp',
        details: 'Re-engagement message'
      },
      fbtrace_id: 'A1B2C3D4'
    }
  };

  const evalResult = evaluateMetaApiResponse(meta24hErrorResponse, 400, '919798637485');
  assert.strictEqual(evalResult.success, false);
  assert.strictEqual(evalResult.code, 131047);
  assert.ok(evalResult.remediation.includes('erp_architecture_review_update'), 'Remediation must point to approved template');

  // Scenario 8b: Invalid recipient number
  const metaInvalidPhoneResponse = {
    error: {
      message: '(#100) The parameter to is invalid: BOSS_NUMBER_1',
      type: 'OAuthException',
      code: 100,
      fbtrace_id: 'X9Y8Z7'
    }
  };
  const evalPhoneResult = evaluateMetaApiResponse(metaInvalidPhoneResponse, 400, 'BOSS_NUMBER_1');
  assert.strictEqual(evalPhoneResult.code, 100);
  assert.ok(evalPhoneResult.remediation.includes('recipient phone number'), 'Remediation must warn about phone number');
});

// =========================================================================
// TEST 9: Boss Number 1 (919798637485) and Phone Number Sanitization
// =========================================================================
runTest('Test 9: Boss number 1 (919798637485) sanitization and placeholder rejection', () => {
  // Scenario 9a: Placeholder string in config must be rejected
  const numbersWithPlaceholders = sanitizePhoneNumbers(null, 'BOSS_NUMBER_1, BOSS_NUMBER_2');
  assert.deepStrictEqual(numbersWithPlaceholders, ['919798637485'], 'Should fallback to default Boss Number 1 when only placeholders present');

  // Scenario 9b: 10-digit number without country code
  const numbers10Digits = sanitizePhoneNumbers('9798637485');
  assert.deepStrictEqual(numbers10Digits, ['919798637485'], 'Should prefix 10-digit number with 91');

  // Scenario 9c: Formatted with spaces, dashes, or plus
  const formattedNumber = sanitizePhoneNumbers('+91 97986-37485');
  assert.deepStrictEqual(formattedNumber, ['919798637485'], 'Should clean non-digit characters properly');
});

// =========================================================================
// TEST 10: Payload arriving via text/plain (CORS preflight bypass)
// =========================================================================
runTest('Test 10: Parsing text/plain stringified JSON (CORS preflight avoidance)', () => {
  const jsonString = JSON.stringify({
    eventType: 'checklist_update',
    sectionTitle: 'API & Integration Architecture',
    itemTitle: 'Are API contracts defined and versioned?',
    checked: true,
    note: 'OpenAPI 3.1 specifications in /docs/swagger.json',
    updatedBy: 'Satyam'
  });

  const parsed = parseWebhookPayload(jsonString);
  assert.strictEqual(parsed.itemTitle, 'Are API contracts defined and versioned?');
  const validated = validatePayload(parsed);
  assert.strictEqual(validated.checked, true);
  assert.strictEqual(validated.updatedBy, 'Satyam');
});

// =========================================================================
// TEST 11: Freeform message generation fallback
// =========================================================================
runTest('Test 11: Freeform text message formatting for within-window communication', () => {
  const payload = {
    eventType: 'checklist_update',
    sectionTitle: 'Security & Access Control',
    itemTitle: 'How are secrets and credentials managed?',
    checked: true,
    note: 'Environment variables used; Doppler / Vault for production secrets',
    updatedBy: 'Satyam Sharma',
    timestamp: '2026-09-26T12:45:00.000Z'
  };

  const validated = validatePayload(payload);
  const freeform = buildFreeformTextPayload(validated, '919798637485');
  assert.strictEqual(freeform.type, 'text');
  assert.strictEqual(freeform.to, '919798637485');
  assert.ok(freeform.text.body.includes('*ERP Architecture Review Update*'));
  assert.ok(freeform.text.body.includes('*Section:* Security & Access Control'));
  assert.ok(freeform.text.body.includes('*Checklist Item:* How are secrets and credentials managed?'));
  assert.ok(freeform.text.body.includes('Doppler / Vault'));
});

console.log('='.repeat(70));
console.log(`TEST RESULTS: ${passedTests}/${totalTests} tests passed.`);
console.log('='.repeat(70));

if (passedTests !== totalTests) {
  process.exit(1);
}
