# Escrow System API Testing - Quick Start

## 🔑 PREREQUISITE
You need 2 JWT tokens before testing:
- `{{kings_account_token}}` - for kings_account user
- `{{promoter_token}}` - for promoter user

Store these as Postman environment variables.

---

# [CONTRACT 15] Coverage Ratio Testing

## What does this API do?
Returns the escrow coverage ratio for a territory.
- Escrow balance: $75,000
- Pending liabilities: $60,000
- Coverage ratio: 1.25
- Status: GREEN (because >= 1.10)

---

## Request 1: Get Coverage (Kings Account) ✅

**Folder:** `[1] CONTRACT 15 - Coverage Ratio`  
**Name:** `Get Coverage (Kings Account)`  
**Method:** `GET`  
**URL:** `http://localhost:3000/api/v1/escrow/coverage/1`

**Headers:**
```
Authorization: Bearer {{kings_account_token}}
Content-Type: application/json
```

**Body:** (Empty - GET request)

**Expected Response (200):**
```json
{
  "territory_id": 1,
  "escrow_balance": 75000,
  "total_pending_liabilities": 60000,
  "coverage_ratio": "1.25",
  "coverage_status": "GREEN",
  "breakdown": {
    "escrow_balance": 75000,
    "total_deposited": 80000,
    "total_withdrawn": 5000,
    "interest_earned": 450,
    "total_pending_liabilities": 60000
  }
}
```

**✅ What to verify:**
- Status code is `200`
- `coverage_status` is one of: `GREEN`, `AMBER`, `RED`, `NO_LIABILITIES`
- `coverage_ratio` is a valid number
- `breakdown` shows complete financial details

---

## Request 2: Get Coverage (Invalid Territory) ❌

**Folder:** `[1] CONTRACT 15 - Coverage Ratio`  
**Name:** `Get Coverage (Invalid Territory)`  
**Method:** `GET`  
**URL:** `http://localhost:3000/api/v1/escrow/coverage/99999`

**Headers:**
```
Authorization: Bearer {{kings_account_token}}
Content-Type: application/json
```

**Body:** (Empty)

**Expected Response (404):**
```json
{
  "error": "TERRITORY_NOT_FOUND",
  "message": "Territory not found."
}
```

**✅ What to verify:**
- Status code is `404`
- Error message is clear

---

# [CONTRACT 16] Promoter Escrow View Testing

## What does this API do?
Returns a promoter's personal escrow holdings with pending payout details.

---

## Request 3: Get Own Escrow (Promoter) ✅

**Folder:** `[2] CONTRACT 16 - Promoter Escrow`  
**Name:** `Get Own Escrow (Promoter)`  
**Method:** `GET`  
**URL:** `http://localhost:3000/api/v1/promoter/finance/escrow`

**Headers:**
```
Authorization: Bearer {{promoter_token}}
Content-Type: application/json
```

**Body:** (Empty)

**Expected Response (200):**
```json
{
  "promoter_id": 10,
  "events": [
    {
      "event_id": 1,
      "event_name": "Tech Conference 2026",
      "gross_ticket_revenue": 5000,
      "refund_deductions": 200,
      "net_liability": 4800,
      "status": "HOLDING",
      "days_until_settlement": 5,
      "refund_window_open": true
    },
    {
      "event_id": 2,
      "event_name": "Music Festival",
      "gross_ticket_revenue": 3000,
      "refund_deductions": 0,
      "net_liability": 3000,
      "status": "PAYOUT_ELIGIBLE",
      "days_until_settlement": 2,
      "refund_window_open": false
    }
  ],
  "totals": {
    "total_held": 4800,
    "total_eligible_for_payout": 3000,
    "total_escrow": 7800,
    "currency": "GBP"
  }
}
```

**✅ What to verify:**
- Status code is `200`
- Returns only THIS promoter's data
- Shows events with `HOLDING` and `PAYOUT_ELIGIBLE` statuses
- Totals calculated correctly

---

## Request 4: Get Other Promoter (Kings Account) ✅

**Folder:** `[2] CONTRACT 16 - Promoter Escrow`  
**Name:** `Get Other Promoter (Kings Account)`  
**Method:** `GET`  
**URL:** `http://localhost:3000/api/v1/promoter/finance/escrow?promoter_id=5`

**Headers:**
```
Authorization: Bearer {{kings_account_token}}
Content-Type: application/json
```

**Body:** (Empty)

**Expected Response (200):**
```json
{
  "promoter_id": 5,
  "events": [
    {
      "event_id": 3,
      "event_name": "Art Exhibition",
      "gross_ticket_revenue": 2000,
      "refund_deductions": 100,
      "net_liability": 1900,
      "status": "HOLDING",
      "days_until_settlement": 7,
      "refund_window_open": true
    }
  ],
  "totals": {
    "total_held": 1900,
    "total_eligible_for_payout": 0,
    "total_escrow": 1900,
    "currency": "GBP"
  }
}
```

**✅ What to verify:**
- Status code is `200`
- Kings Account can view ANY promoter's data via `?promoter_id=5`
- Shows different promoter's data

---

# [CONTRACT 17] Interest History Testing

## What does this API do?
Returns the history of interest earned on escrow accounts for a territory.

---

## Request 5: Get Interest History (Kings Account) ✅

**Folder:** `[3] CONTRACT 17 - Interest History`  
**Name:** `Get Interest History (Kings Account)`  
**Method:** `GET`  
**URL:** `http://localhost:3000/api/v1/escrow/interest/1`

**Headers:**
```
Authorization: Bearer {{kings_account_token}}
Content-Type: application/json
```

**Body:** (Empty)

**Expected Response (200):**
```json
{
  "summary": {
    "territory_id": 1,
    "total_interest_earned": 1250.50,
    "period_start": "2026-01-01",
    "period_end": "2026-03-04",
    "currency": "GBP"
  },
  "entries": [
    {
      "interest_id": 1,
      "period_start": "2026-03-01",
      "period_end": "2026-03-04",
      "opening_balance": 75000,
      "interest_rate": 4.5,
      "interest_amount": 37.50,
      "source": "bank_statement",
      "recorded_by": "finance_user_123",
      "created_at": "2026-03-04T10:30:00Z"
    },
    {
      "interest_id": 2,
      "period_start": "2026-02-01",
      "period_end": "2026-02-28",
      "opening_balance": 72000,
      "interest_rate": 4.5,
      "interest_amount": 270.00,
      "source": "bank_statement",
      "recorded_by": "finance_user_123",
      "created_at": "2026-02-28T11:15:00Z"
    }
  ]
}
```

**✅ What to verify:**
- Status code is `200`
- `summary` shows total interest earned
- `entries` is ordered newest first (DESC by created_at)
- All entries have required fields

---

## Request 6: Get Interest with Date Range ✅

**Folder:** `[3] CONTRACT 17 - Interest History`  
**Name:** `Get Interest (With Date Range)`  
**Method:** `GET`  
**URL:** `http://localhost:3000/api/v1/escrow/interest/1?from=2026-02-01&to=2026-02-28`

**Headers:**
```
Authorization: Bearer {{kings_account_token}}
Content-Type: application/json
```

**Body:** (Empty)

**Expected Response (200):**
```json
{
  "summary": {
    "territory_id": 1,
    "total_interest_earned": 270.00,
    "period_start": "2026-02-01",
    "period_end": "2026-02-28",
    "currency": "GBP"
  },
  "entries": [
    {
      "interest_id": 2,
      "period_start": "2026-02-01",
      "period_end": "2026-02-28",
      "opening_balance": 72000,
      "interest_rate": 4.5,
      "interest_amount": 270.00,
      "source": "bank_statement",
      "recorded_by": "finance_user_123",
      "created_at": "2026-02-28T11:15:00Z"
    }
  ]
}
```

**✅ What to verify:**
- Status code is `200`
- Only entries within date range returned
- Summary total matches filtered entries

---

# ✅ Testing Checklist

## CONTRACT 15 (Coverage Ratio)
- [ ] Request 1: Kings Account gets coverage
- [ ] Request 2: Invalid territory returns 404

## CONTRACT 16 (Promoter Escrow)
- [ ] Request 3: Promoter sees own escrow
- [ ] Request 4: Kings Account can view other promoter

## CONTRACT 17 (Interest History)
- [ ] Request 5: Kings Account gets all interest history
- [ ] Request 6: Kings Account gets filtered date range

---

## 🎯 Summary

| Endpoint | Method | URL | Role Required |
|----------|--------|-----|---------------|
| Coverage Ratio | GET | `/api/v1/escrow/coverage/:territory_id` | kings_account |
| Promoter Escrow | GET | `/api/v1/promoter/finance/escrow` | promoter, kings_account |
| Interest History | GET | `/api/v1/escrow/interest/:territory_id` | kings_account |

**Good luck testing!** 🚀
