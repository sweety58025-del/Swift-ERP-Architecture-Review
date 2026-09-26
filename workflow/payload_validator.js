/**
 * Payload Validator & Message Generator for ERP Architecture Review -> WhatsApp Automation
 * Used in n8n Code Nodes, tests, and integration scripts.
 */

const DEFAULT_CHECKLIST_URL = 'https://swift-erp-architecture-review-ddlqd6zew.vercel.app/';
const DEFAULT_BOSS_NUMBERS = ['919798637485']; // Boss Number 1
const TEMPLATE_NAME = 'erp_architecture_review_update';
const TEMPLATE_LANG = 'en_IN';

/**
 * Parses raw webhook input from n8n or HTTP request.
 * Handles both parsed JSON objects and raw JSON strings sent via text/plain (CORS workaround).
 *
 * @param {any} rawInput
 * @returns {object}
 */
function parseWebhookPayload(rawInput) {
  if (!rawInput) {
    throw new Error('Empty payload received');
  }

  // Handle n8n webhook envelope if present
  let data = rawInput;
  if (data.body !== undefined) {
    data = data.body;
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) {
      throw new Error('Empty payload string received');
    }
    try {
      data = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Failed to parse text/plain JSON payload: ${err.message}`);
    }
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Payload must be a valid JSON object');
  }

  return data;
}

/**
 * Validates the checklist update payload.
 * Important: Updates are INDEPENDENT. No 42-item completion check.
 *
 * @param {object} payload
 * @returns {object} Validated normalized payload
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Validation failed: payload must be an object');
  }

  // itemTitle is the essential identifier of what was changed
  const itemTitle = payload.itemTitle ? String(payload.itemTitle).trim() : '';
  if (!itemTitle) {
    throw new Error('Validation failed: "itemTitle" is required to identify the checklist item');
  }

  const sectionTitle = payload.sectionTitle ? String(payload.sectionTitle).trim() : 'Architecture Review';

  // checked must be a boolean (strict or coerced)
  let checked = false;
  if (typeof payload.checked === 'boolean') {
    checked = payload.checked;
  } else if (payload.checked === 'true' || payload.checked === 1 || payload.checked === '1') {
    checked = true;
  } else if (payload.checked === 'false' || payload.checked === 0 || payload.checked === '0') {
    checked = false;
  }

  const note = payload.note ? String(payload.note).trim() : '';
  const updatedBy = payload.updatedBy ? String(payload.updatedBy).trim() : 'Reviewer';
  const timestamp = payload.timestamp ? String(payload.timestamp).trim() : new Date().toISOString();
  const eventType = payload.eventType ? String(payload.eventType).trim() : 'checklist_update';
  const checklistUrl = payload.checklistUrl || payload.pageUrl || DEFAULT_CHECKLIST_URL;
  const itemId = payload.itemId ? String(payload.itemId).trim() : '';
  const sectionId = payload.sectionId !== undefined ? String(payload.sectionId).trim() : '';

  return {
    eventType,
    sectionTitle,
    itemTitle,
    checked,
    note,
    updatedBy,
    timestamp,
    checklistUrl,
    itemId,
    sectionId
  };
}

/**
 * Converts ISO timestamp to readable IST (Indian Standard Time) string.
 * Format: 26-Sep-2026 18:05:00 IST
 *
 * @param {string} isoString
 * @returns {string}
 */
function formatISTTime(isoString) {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' IST';
  } catch {
    return isoString;
  }
}

/**
 * Normalizes and validates phone numbers.
 * Rejects placeholder strings (e.g. 'BOSS_NUMBER_1').
 * Prepend '91' to 10-digit Indian numbers.
 *
 * @param {string|string[]} [overrideRecipients]
 * @param {string} [envNumbers]
 * @returns {string[]} Valid normalized phone numbers
 */
function sanitizePhoneNumbers(overrideRecipients, envNumbers) {
  const candidates = [];

  // 1. Explicit override (e.g. from payload for direct testing)
  if (overrideRecipients) {
    if (Array.isArray(overrideRecipients)) {
      candidates.push(...overrideRecipients);
    } else if (typeof overrideRecipients === 'string') {
      candidates.push(...overrideRecipients.split(','));
    }
  }

  // 2. Environment variable
  if (envNumbers && typeof envNumbers === 'string') {
    candidates.push(...envNumbers.split(','));
  }

  // 3. Fallback default boss numbers
  if (candidates.length === 0) {
    candidates.push(...DEFAULT_BOSS_NUMBERS);
  }

  const validNumbers = [];
  const placeholderRegex = /^BOSS_NUMBER/i;

  for (let raw of candidates) {
    if (!raw) continue;
    const str = String(raw).trim();

    // Check and reject placeholder text
    if (placeholderRegex.test(str)) {
      console.warn(`[Phone Sanitize] Ignored unconfigured placeholder: "${str}"`);
      continue;
    }

    // Keep only digits
    const digits = str.replace(/\D/g, '');
    if (!digits) continue;

    // Normalization for Indian numbers:
    // If 10 digits (e.g. 9798637485), prefix 91 -> 919798637485
    if (digits.length === 10) {
      validNumbers.push('91' + digits);
    } else if (digits.length === 12 && digits.startsWith('91')) {
      validNumbers.push(digits);
    } else if (digits.length >= 10 && digits.length <= 15) {
      // E.164 international format without plus
      validNumbers.push(digits);
    } else {
      console.warn(`[Phone Sanitize] Invalid phone number length: "${str}" (${digits.length} digits)`);
    }
  }

  // Deduplicate
  const uniqueNumbers = Array.from(new Set(validNumbers));

  // If all were placeholders and nothing valid remains, fallback to default Boss Number 1
  if (uniqueNumbers.length === 0) {
    return [...DEFAULT_BOSS_NUMBERS];
  }

  return uniqueNumbers;
}

/**
 * Builds Meta WhatsApp Cloud API Template Payload.
 * Uses approved template: `erp_architecture_review_update` (en_IN)
 *
 * Parameters:
 * {{1}} = sectionTitle
 * {{2}} = itemTitle
 * {{3}} = status
 * {{4}} = note (defaults to 'None' if empty - Meta rejects empty string parameters!)
 * {{5}} = updatedBy
 * {{6}} = formattedTime
 * {{7}} = checklistUrl
 *
 * @param {object} validated
 * @param {string} recipientNumber
 * @returns {object} Meta Graph API request body
 */
function buildMetaTemplatePayload(validated, recipientNumber) {
  const status = validated.checked ? 'Reviewed / Done' : 'Unchecked / Pending';
  // Meta parameters MUST be non-empty strings
  const displayNote = validated.note && validated.note.trim() !== '' ? validated.note.trim() : 'None';
  const formattedTime = formatISTTime(validated.timestamp);

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientNumber,
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: {
        code: TEMPLATE_LANG
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(validated.sectionTitle) },
            { type: 'text', text: String(validated.itemTitle) },
            { type: 'text', text: String(status) },
            { type: 'text', text: String(displayNote) },
            { type: 'text', text: String(validated.updatedBy) },
            { type: 'text', text: String(formattedTime) },
            { type: 'text', text: String(validated.checklistUrl) }
          ]
        }
      ]
    }
  };
}

/**
 * Builds Free-Form Text message (for within active 24h customer window or fallback).
 *
 * @param {object} validated
 * @param {string} recipientNumber
 * @returns {object} Meta Graph API request body
 */
function buildFreeformTextPayload(validated, recipientNumber) {
  const status = validated.checked ? '✅ Reviewed / Done' : '⬜ Unchecked / Pending';
  const displayNote = validated.note && validated.note.trim() !== '' ? validated.note.trim() : 'None';
  const formattedTime = formatISTTime(validated.timestamp);

  const textBody = [
    `*ERP Architecture Review Update*`,
    ``,
    `*Section:* ${validated.sectionTitle}`,
    `*Checklist Item:* ${validated.itemTitle}`,
    `*Status:* ${status}`,
    `*Note:* ${displayNote}`,
    `*Updated by:* ${validated.updatedBy}`,
    `*Time:* ${formattedTime}`,
    ``,
    `*Checklist:* ${validated.checklistUrl}`
  ].join('\n');

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientNumber,
    type: 'text',
    text: {
      preview_url: true,
      body: textBody
    }
  };
}

/**
 * Evaluates Meta WhatsApp Graph API response.
 * Parses and extracts useful diagnostics on failure.
 *
 * @param {object} responseBody
 * @param {number} httpStatus
 * @param {string} recipientNumber
 * @returns {object} Diagnostic result
 */
function evaluateMetaApiResponse(responseBody, httpStatus, recipientNumber) {
  if (httpStatus >= 200 && httpStatus < 300 && responseBody && responseBody.messages) {
    return {
      success: true,
      recipient: recipientNumber,
      messageId: responseBody.messages[0] ? responseBody.messages[0].id : null,
      httpStatus
    };
  }

  const errorObj = (responseBody && responseBody.error) || responseBody || {};
  const errorCode = errorObj.code || httpStatus;
  const errorMessage = errorObj.message || 'Unknown Meta API error';
  const errorType = errorObj.type || 'MetaAPIError';
  const errorSubcode = errorObj.error_subcode || null;

  let remediation = 'Check Meta WhatsApp Cloud API credentials and payload.';
  if (errorCode === 131047) {
    remediation = 'Customer service window (24 hours) is closed. You MUST use an approved template (erp_architecture_review_update) rather than freeform text.';
  } else if (errorCode === 132000 || errorCode === 132001) {
    remediation = 'Template "erp_architecture_review_update" was not found or is not approved in Meta WhatsApp Manager for language en_IN.';
  } else if (errorCode === 132007) {
    remediation = 'Template parameter mismatch. Ensure exactly 7 text parameters are passed and none are empty strings.';
  } else if (errorCode === 100) {
    remediation = `Invalid parameter. Verify recipient phone number "${recipientNumber}" and request fields.`;
  } else if (errorCode === 190) {
    remediation = 'WhatsApp Access Token is expired or invalid. Refresh your System User token in Meta Business Manager.';
  }

  return {
    success: false,
    recipient: recipientNumber,
    httpStatus,
    code: errorCode,
    subcode: errorSubcode,
    type: errorType,
    message: errorMessage,
    remediation
  };
}

module.exports = {
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
};
