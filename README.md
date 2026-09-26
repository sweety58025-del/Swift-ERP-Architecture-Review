# Swift ERP Architecture Review — WhatsApp Notification Automation

This repository houses the **ERP Architecture & Non-Functional Requirements Checklist** application (comprising 42 review items across 7 core architecture sections) and its automated integration pipeline to dispatch real-time WhatsApp updates to leadership upon every individual review item update.

---

## 1. Architectural Pipeline & Lifecycle

```
┌─────────────────────────────────┐
│     Checklist UI (Browser)      │  User checks item / adds note (saved locally)
│  (LocalStorage sync immediate)  │  User clicks "Send to WhatsApp" button
└────────────────┬────────────────┘
                 │ POST (text/plain JSON to avoid CORS preflight)
                 ▼
┌─────────────────────────────────┐
│       n8n Webhook Trigger       │  POST /erp-architecture-review-update
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   Code: Validate & Prepare      │  1. Unwraps raw JSON / text/plain string
│                                 │  2. Validates itemTitle, sectionTitle, checked
│                                 │  3. Formats IST timestamp & display status
│                                 │  4. Resolves Boss phone numbers (919798637485)
│                                 │  5. Assembles Meta Template erp_architecture_review_update
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Meta WhatsApp Cloud API v21.0  │  POST https://graph.facebook.com/v21.0/1158085794064004/messages
│  (Template: en_IN)              │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│       Boss WhatsApp Phone       │  Notification delivered with item, status,
│         (919798637485)          │  note, reviewer name, timestamp, and review link
└─────────────────────────────────┘
```

> **Explicit Send Action:** To prevent accidental spamming while reviewing, checking items, or drafting notes, WhatsApp notifications are dispatched **exclusively when the reviewer clicks the "Send to WhatsApp" button** (available on each item and via the floating quick-send action bar).

---

## 2. Root Cause Analysis (Why Notifications Previously Failed)

Our end-to-end repository and automation audit identified the following critical root causes:

1. **Unconfigured Recipient Placeholders in n8n**:
   - The n8n Code node contained literal placeholder strings: `const BOSS_NUMBERS = ['BOSS_NUMBER_1', 'BOSS_NUMBER_2']`.
   - When n8n sent this to Meta's Cloud API, Meta returned HTTP 400 (`OAuthException: The parameter to is invalid: BOSS_NUMBER_1`).
   - *Fix:* Replaced placeholders with real, sanitized numbers (defaulting to Boss Number 1: `919798637485`, or configurable via `BOSS_WHATSAPP_NUMBERS` environment variable / payload override).

2. **Meta WhatsApp 24-Hour Policy Violation (Freeform Text Outside Customer Care Window)**:
   - The previous n8n node attempted to dispatch a free-form message (`type: 'text', text: { body: $json.message }`).
   - For business-initiated notifications outside an active 24-hour customer service window, Meta strictly rejects freeform text with error `131047` (`Re-engagement message: Message failed to send because more than 24 hours have passed since customer last replied`).
   - *Fix:* Configured the pre-approved WhatsApp Business utility template `erp_architecture_review_update` (`en_IN`) with 7 required parameters.

3. **Frontend Missing `updatedBy` and Event Type Inconsistency**:
   - The checklist frontend in `index.html` dispatched `eventType: "checklist_status"` and `eventType: "note_update"`, but completely omitted the `updatedBy` field.
   - The n8n code node and template parameter `{{5}}` expected `updatedBy`.
   - *Fix:* Added Reviewer tracking with a UI editor (defaulting to `Satyam Sharma`, stored in `localStorage`), and standardized all events to `eventType: "checklist_update"`.

4. **DOM Re-render Breaking Active Textarea Focus and Note Debouncing**:
   - Checking a box triggered `render()`, which wiped `main.innerHTML` and recreated all DOM nodes, clearing ongoing note debounces and stealing input focus.
   - *Fix:* Checkbox toggling now updates only the specific item's DOM state and progress bar directly, leaving active textareas uninterrupted.

5. **Empty Note Parameter Rejection in Meta API**:
   - When a checklist item has no note, sending `""` (empty string) as a template parameter causes Meta Cloud API to throw a parameter mismatch error.
   - *Fix:* Sanitized empty notes to `"None"` in template parameter `{{4}}`.

6. **Coupling Risk & False 42-Item Assumptions**:
   - Ensure no blocking condition (e.g. `completedItems === 42`) is present. Every single item update must trigger independently.
   - Decoupled `localStorage` checklist saving from webhook dispatch so that a temporary webhook or network failure never rolls back the user's checklist.

---

## 3. Meta WhatsApp Cloud API Template Specification

### Template Metadata
- **Template Name:** `erp_architecture_review_update`
- **Category:** `UTILITY`
- **Language:** `en_IN` (English - India)

### Parameter Mapping
| Parameter | Value Source | Example Value | Handling if Empty |
|---|---|---|---|
| `{{1}}` | `sectionTitle` | `ERP Performance & Reliability` | Defaults to `"Architecture Review"` |
| `{{2}}` | `itemTitle` | `GRN image upload optimization` | **Required** (validated) |
| `{{3}}` | `status` | `Reviewed / Done` or `Unchecked / Pending` | Dynamic based on `checked` boolean |
| `{{4}}` | `note` | `Direct S3 upload verified` | Defaults to `"None"` (never empty string) |
| `{{5}}` | `updatedBy` | `Satyam Sharma` | Defaults to `"Reviewer"` |
| `{{6}}` | `formattedTime` | `26-Sep-2026 18:05:00 IST` | Converted from ISO timestamp to IST |
| `{{7}}` | `checklistUrl` | `https://swift-erp-architecture-review-ddlqd6zew.vercel.app/` | Deployed checklist URL |

### Sample Payload Sent to Meta API
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919798637485",
  "type": "template",
  "template": {
    "name": "erp_architecture_review_update",
    "language": {
      "code": "en_IN"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "ERP Performance & Reliability" },
          { "type": "text", "text": "GRN image upload optimization" },
          { "type": "text", "text": "Reviewed / Done" },
          { "type": "text", "text": "Direct S3 upload verified; client latency 180ms" },
          { "type": "text", "text": "Satyam Sharma" },
          { "type": "text", "text": "26-Sep-2026 18:05:00 IST" },
          { "type": "text", "text": "https://swift-erp-architecture-review-ddlqd6zew.vercel.app/" }
        ]
      }
    ]
  }
}
```

---

## 4. Configuration & Environment Variables

Copy `.env.example` to `.env` or configure inside your n8n environment:

```bash
# Meta WhatsApp Cloud API credentials
WHATSAPP_ACCESS_TOKEN="your_permanent_system_user_token"
WHATSAPP_PHONE_NUMBER_ID="1158085794064004"

# WhatsApp Business Template
WHATSAPP_TEMPLATE_NAME="erp_architecture_review_update"
WHATSAPP_TEMPLATE_LANG="en_IN"

# Boss WhatsApp Numbers (comma-separated, tested with 919798637485)
BOSS_WHATSAPP_NUMBERS="919798637485"

# Webhook Endpoint (n8n production webhook URL)
CHECKLIST_WEBHOOK_URL="https://footpath-election-catapult.ngrok-free.dev/webhook/erp-architecture-review-update"

# Public Checklist URL
CHECKLIST_URL="https://swift-erp-architecture-review-ddlqd6zew.vercel.app/"
```

> **Security Note:** Private tokens (`WHATSAPP_ACCESS_TOKEN`) reside exclusively in server-side/n8n environments. Never expose them via client-side code or public Git commits.

---

## 5. How to Run the Automated Test Suite

We have implemented an automated test suite verifying all 8 required scenarios plus edge cases.

To execute tests:

```bash
npm test
```

### Verified Test Cases:
- **Test 1:** One unchecked item (`checked = false`) triggers valid notification.
- **Test 2:** One checked item (`checked = true`) triggers valid notification.
- **Test 3:** Checked item with note includes note in parameter `{{4}}`.
- **Test 4:** Checked item without note defaults to `"None"` (never empty string).
- **Test 5:** Different checklist item (item #20) sends independent notification.
- **Test 6:** Only ONE of 42 checklist items exists/updated -> succeeds immediately without 42-item dependency.
- **Test 7:** Invalid webhook payload triggers descriptive validation error and halts dispatch.
- **Test 8:** Meta API failure handling exposes useful diagnostics without corrupting state.
- **Test 9:** Boss Number 1 (`919798637485`) formatting and placeholder rejection.
- **Test 10:** Parsing payload received as `text/plain` string (CORS workaround).
- **Test 11:** Freeform text message formatting fallback.

---

## 6. Testing a Single Item Update against the Live Webhook

You can trigger a test of a single checklist item without filling all 42 items using the provided script:

```bash
# Test with Boss Number 1 (checked = true)
node scripts/test_webhook.js --phone 919798637485 --item "GRN image upload optimization" --checked true --note "Test notification"

# Test with Boss Number 1 (checked = false)
node scripts/test_webhook.js --phone 919798637485 --item "GRN image upload optimization" --checked false --note "Item unchecked"
```

Or via `curl`:

```bash
curl -X POST \
  -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{"eventType":"checklist_update","sectionTitle":"ERP Performance","itemTitle":"GRN image upload optimization","checked":true,"note":"Single item test","updatedBy":"Satyam","recipientPhoneNumber":"919798637485"}' \
  https://footpath-election-catapult.ngrok-free.dev/webhook/erp-architecture-review-update
```

---

## 7. Importing the n8n Workflow

1. Open your n8n workspace.
2. Navigate to **Workflows** → **Import from File**.
3. Select `workflow/erp_architecture_review_update.workflow.json`.
4. Ensure the **HTTP: Send Meta WhatsApp Template** node is configured with your Meta Cloud API Bearer Token credential.
5. Activate the workflow so the production webhook URL `https://footpath-election-catapult.ngrok-free.dev/webhook/erp-architecture-review-update` receives requests.