# Guru Registration & Auth Flow - Complete API Documentation

**Version:** 1.0  
**Last Updated:** February 26, 2026  
**Status:** Complete with new Marketing Hub & Onboarding APIs

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Screen-by-Screen Flow](#screen-by-screen-flow)
3. [API Endpoints Reference](#api-endpoints-reference)
4. [Client Flows](#client-flows)
5. [Failure Scenarios](#failure-scenarios)
6. [Database Requirements](#database-requirements)

---

## Overview

This document describes the complete Guru registration, authentication, and onboarding flow for the Eventopia platform. Gurus are contracted platform partners who recruit, train, and manage promoters.

**Key Principles:**
- Gurus are contracted, not public sign-up
- 12-month contract term from activation
- Three performance-based levels (Level 3 unlocks cash withdrawal)
- Marketing Hub as central content management system
- Level 3 achieved through Sprint Mode, not payment

---

## Screen-by-Screen Flow

### **Screen 1: Invite Link Validation**

**User Story:**  
As an invited Guru, I want to open my invite link so I can start onboarding.

**Context:**
- Invites are controlled and created by Admin/Network Manager
- Each invite has expiry and single-use validation
- Invite carries email, role, and network manager assignment

**API Endpoint:**
```
GET /api/invites/validate/:inviteToken
```

**Request:**
```bash
curl -X GET "http://localhost/api/invites/validate/abc123def456"
```

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Invitation is valid",
  "data": {
    "inviteToken": "abc123def456",
    "email": "guru@example.com",
    "name": "John Guru",
    "role": "guru",
    "expiresAt": "2026-03-26T23:59:59Z",
    "createdAt": "2026-02-20T10:00:00Z",
    "createdBy": "Jane Network Manager",
    "isValid": true,
    "status": "active"
  }
}
```

**Error Responses:**

| Error | Status | Code | Message |
|-------|--------|------|---------|
| Invite not found | 404 | `INVITE_NOT_FOUND` | "This invitation link is invalid or has been removed" |
| Invite expired | 410 | `INVITE_EXPIRED` | "This invitation has expired. Please request a new invitation..." |
| Already used | 409 | `INVITE_ALREADY_USED` | "This invitation has already been accepted. Please log in..." |

---

### **Screen 2: Login or Create Account**

**User Story:**  
As an invited Guru, I want to log in or create my account so Eventopia can identify me.

**Flow:**
- If new user → Register with email + password + invite token
- If existing user → Login with email + password

**API Endpoints:**

#### Register (New User)
```
POST /api/auth/register
```

**Request:**
```json
{
  "email": "guru@example.com",
  "password": "SecurePass123!",
  "invite_token": "abc123def456",
  "device_token": "optional_device_id"
}
```

**Response (Success - 201):**
```json
{
  "error": false,
  "message": "User registered successfully. Please verify your email.",
  "data": {
    "userId": "user_12345",
    "email": "guru@example.com",
    "role": "buyer",
    "accountStatus": "pending",
    "setupRequired": true,
    "nextStep": "verify_email",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresAt": "2026-02-27T10:00:00Z"
  }
}
```

#### Login (Existing User)
```
POST /api/auth/login
```

**Request:**
```json
{
  "email": "guru@example.com",
  "password": "SecurePass123!"
}
```

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Login successful",
  "data": {
    "userId": "user_12345",
    "email": "guru@example.com",
    "name": "John Guru",
    "role": "guru",
    "accountStatus": "active",
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresAt": "2026-02-27T10:00:00Z"
  }
}
```

---

### **Screen 3: Verify Email**

**User Story:**  
As a Guru, I want to verify my email so I can continue onboarding and keep the account secure.

**Flow:**
1. User receives OTP via email after registration
2. User enters OTP code
3. Email marked as verified

**API Endpoint:**
```
POST /api/auth/verify-email
```

**Request Option A - Email:**
```json
{
  "email": "guru@example.com",
  "otp": "123456",
  "purpose": "signup"
}
```

**Request Option B - User ID:**
```json
{
  "userId": "user_12345",
  "otp": "123456"
}
```

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Email verified successfully. You can now proceed to Guru setup.",
  "data": {
    "userId": "user_12345",
    "email": "guru@example.com",
    "emailStatus": "verified",
    "setupRequired": true,
    "nextStep": "application_setup"
  }
}
```

**Alternative: Resend OTP**
```
POST /api/auth/otp/resend
```

**Request:**
```json
{
  "email": "guru@example.com"
}
```

---

### **Screen 4: Accept Guru Contract Terms**

**User Story:**  
As a Guru, I want to read and accept the contract so I can proceed.

**Context:**
- Contract is 12 months from activation
- Two agreements required: Terms of Service + Guru Agreement
- Part of application creation

**API Endpoint:**
```
POST /api/gurus/applications
```

**Request:**
```json
{
  "network_manager_user_id": "nm_user_123",
  "avatar_url": "https://cdn.example.com/avatar.jpg",
  "agreed_to_terms": true,
  "agreed_to_guru_agreement": true
}
```

**Response (Success - 201):**
```json
{
  "error": false,
  "message": "Your Guru application has been submitted successfully. Please wait for approval.",
  "data": {
    "application": {
      "id": "app_guru_456",
      "networkManagerId": "nm_user_123",
      "networkManagerName": "Jane Network Manager",
      "territoryName": "London",
      "accountStatus": "pending",
      "createdAt": "2026-02-26T10:00:00Z"
    }
  }
}
```

---

### **Screen 5: Guru Licence Summary**

**User Story:**  
As a Guru, I want to see my licence rules so I understand how I unlock access.

**Context:**
- Base licence model is shown
- Service fee rules for Level 1 explained
- Level 3 enhanced licence with cash withdrawal shown
- Contract (12 months from activation) detailed

**API Endpoint:**
```
GET /api/gurus/license/info
```

**Required Auth:** Yes (Bearer token)

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "License information retrieved",
  "data": {
    "baseLicense": {
      "model": "Base Guru Licence",
      "description": "Foundation level access to the Eventopia Guru platform",
      "serviceFeeName": "Guru Activation Fee",
      "serviceFee": {
        "amount": 25000,
        "currency": "GBP",
        "displayAmount": "£250"
      },
      "paymentOptions": [
        {
          "option": "upfront",
          "label": "Pay Upfront",
          "description": "Pay the full fee immediately to activate"
        },
        {
          "option": "negative_balance",
          "label": "From Earnings",
          "description": "Pay from earned commissions (earnings credit)"
        }
      ],
      "levelsCovered": [1]
    },
    "level1Details": {
      "tier": "Level 1: Base Guru",
      "description": "Entry-level guru with base licensing",
      "features": [
        "Access to recruit promoters",
        "Basic referral tools and tracking",
        "Marketing Hub with content submissions",
        "Performance dashboard",
        "Commission tracking",
        "Referral rewards"
      ],
      "serviceFeeCleared": "Fee is cleared from earned credit as you generate commission",
      "clearingMechanism": "Commission earned through ticket sales and referrals reduces your activation fee balance",
      "ticketCommissionRate": "8% of ticket sales",
      "cashWithdrawal": false
    },
    "level3EnhancedLicense": {
      "tier": "Level 3: Master Guru",
      "description": "Premium licence with cash withdrawal privileges",
      "licenseType": "Enhanced Licence",
      "licenseFeatures": [
        "All Level 2 features",
        "🔓 CASH WITHDRAWAL PRIVILEGES (Locked at Levels 1-2)",
        "Premium analytics dashboard",
        "Co-marketing opportunities",
        "Featured on platform",
        "Dedicated premium support"
      ],
      "cashWithdrawalPrivileges": {
        "unlocked": true,
        "description": "Withdraw commissions directly to your bank account",
        "minimumWithdrawal": 5000,
        "withdrawalFee": "2.5%",
        "processingTime": "2-3 business days"
      },
      "requirements": {
        "progression": "Earned through performance, not a simple paid upgrade",
        "method": "Complete Sprint Mode push from Level 2",
        "estimatedTime": "90-day rolling window"
      }
    },
    "contractTerms": {
      "contractPeriod": "12 months from activation",
      "startDate": "2026-02-26",
      "endDate": "2027-02-26",
      "autoRenewal": true,
      "autoRenewalNotice": "30 days before contract end",
      "status": "pending_activation"
    },
    "keyTakeaways": [
      "The base licence is cleared from earned credit as you complete tasks",
      "Level 3 requires performance achievement, not payment",
      "Cash withdrawal privileges are only available at Level 3",
      "Your contract is valid for 12 months from activation"
    ]
  }
}
```

---

### **Screen 6: Activation Confirmation**

**User Story:**  
As a Guru, I want confirmation that my Guru role is active so I can enter the portal.

**Flow:**
1. Guru commits to activation fee (upfront or negative balance)
2. System records commitment
3. Awaits Network Manager or Admin approval
4. Once approved, guru is activated

**API Endpoint:**
```
POST /api/gurus/activation-fee/commit
```

**Request:**
```json
{
  "choice": "upfront"
}
```

**Parameters:**
- `choice` (required): "upfront" (pay immediately) OR "negative_balance" (pay from earnings)

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Activation fee commitment recorded successfully.",
  "data": {
    "activationFeeStatus": "committed_upfront",
    "activationFeeBalance": 0,
    "amount": 25000,
    "currency": "GBP",
    "nextStep": "pending_approval",
    "message": "Your guru activation is pending approval from your Network Manager or Admin. You will be notified once approved."
  }
}
```

**Check Application Status:**
```
GET /api/gurus/applications/me
```

**Response:**
```json
{
  "error": false,
  "message": "Guru application retrieved successfully.",
  "data": {
    "application": {
      "id": "app_guru_456",
      "accountStatus": "approved",
      "activationFeeStatus": "committed_upfront",
      "activationFeeBalance": 0,
      "nextStep": "setup_complete",
      "networkManager": {
        "id": "nm_user_123",
        "name": "Jane Network Manager"
      }
    }
  }
}
```

---

### **Screen 7: Role Switcher**

**User Story:**  
As a user with multiple roles, I want to select Guru so I land in the right portal.

**Context:**
- Users can have multiple roles (buyer, promoter, guru)
- Upon login, GET /auth/me returns role information
- Frontend displays role switcher if multiple roles exist
- Selecting role redirects to role-specific dashboard

**API Endpoints:**

#### Get Current User (shows active role)
```
GET /api/auth/me
```

**Response (User with Multiple Roles):**
```json
{
  "error": false,
  "message": "User data retrieved successfully.",
  "data": {
    "userId": "user_12345",
    "email": "guru@example.com",
    "name": "John Guru",
    "role": "guru",
    "roles": ["buyer", "promoter", "guru"],
    "accountStatus": "active",
    "setupRequired": false,
    "guruApplication": {
      "id": "app_guru_456",
      "accountStatus": "approved",
      "createdAt": "2026-02-26T10:00:00Z"
    }
  }
}
```

#### Set Active Role
```
POST /api/auth/me/active-role
```

**Note:** Current implementation uses single-role system. Multi-role support would require:
1. Modify user roles model to support multiple roles
2. Add role session tracking
3. Update middleware to check active role instead of single role

**Current Response:**
```json
{
  "error": false,
  "message": "Single-role system: active role cannot be changed.",
  "data": {
    "user": {
      "userId": "user_12345",
      "role": "guru"
    }
  }
}
```

---

### **Screen 8: Guru Portal Entry**

**User Story:**  
As a Guru, I want to enter my dashboard so I can start my work.

**API Endpoint:**
```
GET /api/gurus/me
```

**Required Auth:** Yes (Bearer token + guru role)

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Guru profile retrieved successfully.",
  "data": {
    "profile": {
      "userId": "user_12345",
      "name": "John Guru",
      "email": "guru@example.com",
      "avatarUrl": "https://cdn.example.com/avatar.jpg",
      "role": "guru",
      "accountStatus": "active",
      "territory": {
        "name": "London"
      },
      "networkManager": {
        "id": "nm_user_123",
        "name": "Jane Network Manager",
        "email": "nm@example.com",
        "territory": "London"
      }
    }
  }
}
```

---

### **Screen 9: First Time Onboarding Checklist**

**User Story:**  
As a Guru, I want a checklist so I know what to do first.

**Context:**
- Tracks 4 key onboarding activities
- Shows completion percentage
- Links to each section for quick navigation
- Activities: Referral setup, Hub review, Performance review, Start recruitment

**API Endpoint:**
```
GET /api/gurus/onboarding/checklist
```

**Required Auth:** Yes

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Onboarding checklist retrieved",
  "data": {
    "completionPercentage": 25,
    "items": [
      {
        "id": "referral_setup",
        "title": "Get your referral link or code",
        "description": "Access your unique referral link to recruit promoters",
        "completed": true,
        "order": 1,
        "actionUrl": "/marketing-hub/referral",
        "estimatedTime": "2 minutes"
      },
      {
        "id": "review_hub",
        "title": "Review Marketing Hub sections and toolkits",
        "description": "Explore content submission, messaging, and explainer resources",
        "completed": false,
        "order": 2,
        "actionUrl": "/marketing-hub",
        "estimatedTime": "10 minutes"
      },
      {
        "id": "review_performance",
        "title": "Review performance and level framework",
        "description": "Understand how you progress through levels and earn commissions",
        "completed": false,
        "order": 3,
        "actionUrl": "/dashboard/performance",
        "estimatedTime": "5 minutes"
      },
      {
        "id": "start_recruitment",
        "title": "Start recruitment activity",
        "description": "Recruit your first promoter or submit marketing content",
        "completed": false,
        "order": 4,
        "actionUrl": "/marketing-hub/recruitment",
        "estimatedTime": "Your pace"
      }
    ]
  }
}
```

---

### **Screen 10: Referral Link or Code**

**User Story:**  
As a Guru, I want my referral link or code so I can recruit promoters.

**Context:**
- Unique referral link assigned to each guru
- Promoters use link to register and attach to guru's network
- System auto-generates referral code if not exists

**API Endpoint:**
```
GET /api/gurus/dashboard/referral
```

**Required Auth:** Yes

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Referral info retrieved",
  "data": {
    "referralCode": "GURU_JOHN_123",
    "referralLink": "https://eventopia.com/register?ref=GURU_JOHN_123",
    "createdAt": "2026-02-26T10:00:00Z",
    "shareOptions": [
      {
        "channel": "email",
        "template": "Hi! Join my network on Eventopia and start earning. Click: {referralLink}"
      },
      {
        "channel": "social",
        "template": "I'm growing my promoter network on Eventopia! 🚀 Join me: {referralLink}"
      },
      {
        "channel": "whatsapp",
        "template": "Hey, join my Eventopia network! {referralLink}"
      }
    ],
    "stats": {
      "promotersReferred": 5,
      "activePromoters": 4,
      "totalTicketsSold": 125,
      "commissionsEarned": 10000
    }
  }
}
```

---

### **Screen 11: Marketing Hub Entry Screen**

**User Story:**  
As a Guru, I want access to the Marketing Hub so I can recruit better and sell with consistent messaging.

**Context:**
- Hub is structured system, not just a folder
- Contains 4 main sections + special features
- Sprint Mode becomes available at Level 2
- All content tied to Guru's account and level

**API Endpoint:**
```
GET /api/gurus/marketing-hub
```

**Required Auth:** Yes

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Marketing Hub structure retrieved",
  "data": {
    "sections": [
      {
        "id": "referral_toolkit",
        "title": "Referral Toolkit",
        "description": "Tools to recruit and manage your promoter network",
        "icon": "people-outline",
        "available": true,
        "subsections": [
          {
            "id": "referral_link",
            "title": "Your Referral Link"
          },
          {
            "id": "messaging",
            "title": "Referral Messaging"
          },
          {
            "id": "explainers",
            "title": "Explainer Visuals"
          }
        ]
      },
      {
        "id": "content_submissions",
        "title": "Content Submissions",
        "description": "Upload and submit marketing assets for review",
        "icon": "document-outline",
        "available": true,
        "subsections": [
          {
            "id": "submit_content",
            "title": "Submit New Content"
          },
          {
            "id": "submission_status",
            "title": "Submission Status"
          },
          {
            "id": "approved_assets",
            "title": "Approved Assets"
          }
        ]
      },
      {
        "id": "leaderboard",
        "title": "Performance & Leaderboard",
        "description": "See your standing and compete with other Gurus",
        "icon": "podium-outline",
        "available": true
      },
      {
        "id": "campaign_requests",
        "title": "Custom Campaign Requests",
        "description": "Request custom assets and strategy help (monetised)",
        "icon": "flash-outline",
        "available": true
      }
    ],
    "specialFeatures": [
      {
        "id": "sprint_mode",
        "title": "Sprint Mode (Level 3 Push)",
        "description": "Accelerated progression when you reach Level 2",
        "available": false,
        "level_required": 2
      }
    ],
    "currentLevel": 1,
    "nextLevelRequirements": {
      "level": 2,
      "description": "Earn through event ticket sales and referrals"
    }
  }
}
```

---

### **Screen 12: My Promoters Screen**

**User Story:**  
As a Guru, I want to see "My Promoters" so I can track network activity and performance.

**API Endpoint:**
```
GET /api/gurus/dashboard/promoters
```

**Required Auth:** Yes

**Query Parameters:**
- `dateFrom` (optional): ISO date string
- `dateTo` (optional): ISO date string

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Promoters retrieved",
  "data": [
    {
      "promoterId": "promoter_789",
      "name": "Alice Promoter",
      "email": "alice@example.com",
      "ticketsSold": 45,
      "grossSales": 4500000,
      "joinedAt": "2026-02-15T10:00:00Z"
    },
    {
      "promoterId": "promoter_790",
      "name": "Bob Promoter",
      "email": "bob@example.com",
      "ticketsSold": 80,
      "grossSales": 8000000,
      "joinedAt": "2026-02-10T10:00:00Z"
    }
  ]
}
```

---

### **Screen 13: Performance and Levels Screen**

**User Story:**  
As a Guru, I want to see my level status and targets so I know how to progress.

**Context:**
- Tickets and progress only count after event concludes and revenue is settled
- Level 3 earned via performance, not simple paid upgrade
- Shows current metrics vs. targets
- Sprint Mode available at Level 2

**API Endpoint:**
```
GET /api/gurus/levels/info
```

**Required Auth:** Yes

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Level information retrieved",
  "data": {
    "currentLevel": 1,
    "levels": [
      {
        "level": 1,
        "title": "Level 1: Base Guru",
        "description": "Entry-level guru with base licensing",
        "licenseType": "Base Licence",
        "features": [
          "Access to promoters",
          "Basic referral tools",
          "Marketing Hub access",
          "Commission tracking"
        ],
        "requirements": "Complete registration and activation fee",
        "achieved": true,
        "achievedAt": "2026-02-26T10:00:00Z"
      },
      {
        "level": 2,
        "title": "Level 2: Advanced Guru",
        "description": "Achieved through performance",
        "features": [
          "All Level 1 features",
          "Priority promoter support",
          "Advanced analytics",
          "Custom campaign eligibility",
          "Sprint Mode access"
        ],
        "requirements": "Earn through event ticket sales and referrals",
        "targetMetrics": {
          "ticketsSold": 50,
          "grossSales": 5000
        },
        "currentMetrics": {
          "ticketsSold": 15,
          "grossSales": 1500
        },
        "achieved": false,
        "percentToNext": 30
      },
      {
        "level": 3,
        "title": "Level 3: Master Guru",
        "description": "Peak performance with all privileges",
        "licenseType": "Enhanced Licence ($)",
        "features": [
          "All Level 2 features",
          "Cash withdrawal privileges",
          "Premium analytics dashboard",
          "Dedicated support",
          "Featured on platform"
        ],
        "requirements": "Push through Sprint Mode from Level 2 (90-day rolling window)",
        "targetMetrics": {
          "ticketsSold": 150,
          "sprintWindowTarget": "Dynamic based on performance"
        },
        "achieved": false,
        "sprintModeAvailable": false,
        "percentToNext": 0
      }
    ]
  }
}
```

---

## API Endpoints Reference

### Summary Table

| Screen | Method | Endpoint | Auth | Purpose |
|--------|--------|----------|------|---------|
| 1 | GET | `/api/invites/validate/:inviteToken` | No | Validate invite before registration |
| 2 | POST | `/api/auth/register` | No | Register new guru account |
| 2 | POST | `/api/auth/login` | No | Login existing user |
| 3 | POST | `/api/auth/verify-email` | No | Verify email with OTP |
| 3 | POST | `/api/auth/otp/resend` | No | Resend OTP |
| 4 | POST | `/api/gurus/applications` | Yes | Create guru application + accept terms |
| 5 | GET | `/api/gurus/license/info` | Yes | Get license information |
| 6 | POST | `/api/gurus/activation-fee/commit` | Yes | Commit activation fee |
| 6 | GET | `/api/gurus/applications/me` | Yes | Check application status |
| 7 | GET | `/api/auth/me` | Yes | Get current user info (check roles) |
| 7 | POST | `/api/auth/me/active-role` | Yes | Set active role |
| 8 | GET | `/api/gurus/me` | Yes | Get guru profile |
| 9 | GET | `/api/gurus/onboarding/checklist` | Yes | Get onboarding checklist |
| 10 | GET | `/api/gurus/dashboard/referral` | Yes | Get referral link/code |
| 11 | GET | `/api/gurus/marketing-hub` | Yes | Get hub structure |
| 12 | GET | `/api/gurus/dashboard/promoters` | Yes | Get list of promoters |
| 13 | GET | `/api/gurus/levels/info` | Yes | Get level information |

---

## Client Flows

### **Flow A: Guru Submission and Review**

**Description:**  
Guru uploads marketing content, system tracks it for review, Hatim (admin) approves or rejects, then shared in network.

**API Endpoints:**

#### Submit Content
```
POST /api/gurus/marketing-hub/submissions
```

**Request:**
```json
{
  "title": "Event Promotion Video",
  "description": "30-second intro video for promoter recruitment",
  "content_type": "video",
  "content_url": "https://cdn.example.com/video.mp4",
  "tags": ["recruitment", "promoters", "video"]
}
```

**Parameters:**
- `title` (required): Asset name
- `content_type` (required): "image" | "video" | "copy" | "social_post"
- `content_url` (optional): Direct link to asset
- `description` (optional): Details about asset
- `tags` (optional): Array of tags for organization

**Response:**
```json
{
  "error": false,
  "message": "Content submitted for review",
  "data": {
    "submissionId": "sub_001",
    "status": "pending_review",
    "submittedAt": "2026-02-26T10:00:00Z",
    "estimatedReviewTime": "2-3 business days",
    "nextSteps": "Your submission will be reviewed by our marketing team."
  }
}
```

#### Get Submission Status
```
GET /api/gurus/marketing-hub/submissions
```

**Query Parameters:**
- `status` (optional): "pending_review" | "approved" | "rejected"

**Response:**
```json
{
  "error": false,
  "message": "Submissions retrieved",
  "data": {
    "summary": {
      "total": 3,
      "pending": 1,
      "approved": 2,
      "rejected": 0
    },
    "submissions": [
      {
        "id": "sub_001",
        "title": "Event Promotion Video",
        "contentType": "video",
        "status": "approved",
        "submittedAt": "2026-02-26T10:00:00Z",
        "reviewedAt": "2026-02-27T14:00:00Z",
        "reviewedBy": "hatim@eventopia.com",
        "shared": true,
        "sharedAt": "2026-02-27T14:30:00Z",
        "tags": ["recruitment", "video"]
      }
    ]
  }
}
```

---

### **Flow B: Leaderboard and Recognition**

**Description:**  
Guru sees performance visibility, top performers highlighted, level status and progress shown.

**API Endpoints:**

#### Get Leaderboard
```
GET /api/gurus/leaderboard
```

**Query Parameters:**
- `period` (optional): "month" (default) | "year" | "all_time"
- `limit` (optional): Max results (default 10)

**Response:**
```json
{
  "error": false,
  "message": "Leaderboard retrieved",
  "data": {
    "period": "month",
    "leaderboard": [
      {
        "rank": 1,
        "guruId": "guru_001",
        "name": "Top Guru",
        "avatarUrl": "https://cdn.example.com/avatar1.jpg",
        "level": 3,
        "promotersCount": 12,
        "ticketsSold": 250,
        "grossSales": 25000000,
        "commissionEarned": 2000000
      },
      {
        "rank": 2,
        "guruId": "guru_002",
        "name": "Second Best",
        "level": 2,
        "promotersCount": 8,
        "ticketsSold": 180,
        "grossSales": 18000000,
        "commissionEarned": 1440000
      },
      {
        "rank": 3,
        "guruId": "user_12345",
        "name": "John Guru",
        "level": 1,
        "promotersCount": 2,
        "ticketsSold": 15,
        "grossSales": 1500000,
        "commissionEarned": 120000
      }
    ],
    "generatedAt": "2026-02-26T10:00:00Z"
  }
}
```

---

### **Flow C: Referral Toolkit**

**Description:**  
Referral toolkit shown only when referral system active. Includes messaging, scripts, and explainer visuals.

**Included in Screen 10 and Marketing Hub responses:**
- Referral link/code
- Share templates (email, social, WhatsApp)
- Performance stats
- Explainer resources

**Additional Data in Dashboard Referral Endpoint:**
```json
"shareOptions": [
  {
    "channel": "email",
    "template": "Pre-written email template for referrals"
  },
  {
    "channel": "social",
    "template": "Instagram/Twitter/LinkedIn ready posts"
  }
]
```

---

### **Flow D: Custom Campaign Requests**

**Description:**  
Guru requests custom assets and strategy help. Requests are monetised via credit.

**API Endpoints:**

#### Create Campaign Request
```
POST /api/gurus/marketing-hub/campaign-requests
```

**Request:**
```json
{
  "title": "Instagram Ad Series",
  "description": "Need 5 Instagram carousel ads promoting Level 3 benefits",
  "asset_type": "social_ads",
  "target_audience": "Promoters aged 25-40",
  "estimated_credits_needed": 500
}
```

**Response:**
```json
{
  "error": false,
  "message": "Campaign request submitted",
  "data": {
    "requestId": "req_001",
    "status": "pending",
    "estimatedCreditsNeeded": 500,
    "requestedAt": "2026-02-26T10:00:00Z"
  }
}
```

#### Get Campaign Requests
```
GET /api/gurus/marketing-hub/campaign-requests
```

**Response:**
```json
{
  "error": false,
  "message": "Campaign requests retrieved",
  "data": [
    {
      "id": "req_001",
      "title": "Instagram Ad Series",
      "description": "Need 5 Instagram carousel ads...",
      "assetType": "social_ads",
      "targetAudience": "Promoters aged 25-40",
      "estimatedCreditsNeeded": 500,
      "status": "completed",
      "requestedAt": "2026-02-26T10:00:00Z",
      "completedAt": "2026-02-28T15:00:00Z",
      "creditsUsed": 450
    }
  ]
}
```

---

### **Flow E: Level 3 Sprint Mode (Progression)**

**Description:**  
When Guru reaches Level 2, Sprint Mode supports the push to Level 3. Uses rolling window and ticket targets. Cash privileges tied to Level 3 only.

**API Endpoint:**
```
GET /api/gurus/sprint-mode
```

**Required Auth:** Yes (guru role + Level 2+)

**Response (Success - 200):**
```json
{
  "error": false,
  "message": "Sprint mode information retrieved",
  "data": {
    "status": "active",
    "windowStart": "2026-02-26T10:00:00Z",
    "windowEnd": "2026-05-26T10:00:00Z",
    "daysRemaining": 89,
    "ticketTarget": "Dynamic based on current average",
    "currentPerformance": {
      "ticketsSold": 45,
      "grossSales": 4500000,
      "percentOfTarget": 45
    },
    "benefits": [
      "Fast-tracked progression to Level 3",
      "Unlock cash withdrawal privileges",
      "Premium analytics during sprint",
      "Dedicated sprint support"
    ],
    "nextMilestone": {
      "ticketsNeeded": 55,
      "daysRemaining": 89
    }
  }
}
```

---

## Failure Scenarios

### **Scenario A: Invite Expired**

**User:**  
As a Guru, I want a clear message when my invite is expired so I can request a new one.

**Trigger:** User clicks invite link older than expiry date

**API Response:**
```json
{
  "error": true,
  "status": 410,
  "code": "INVITE_EXPIRED",
  "message": "This invitation has expired. Please request a new invitation from your Network Manager or Admin",
  "data": null
}
```

**UX Action:** Show clear message + link to contact support/network manager

---

### **Scenario B: Invite Already Used**

**User:**  
As a Guru, I want to see that the invite is already accepted so I can log in.

**Trigger:** User or someone else already registered with this invite

**API Response:**
```json
{
  "error": true,
  "status": 409,
  "code": "INVITE_ALREADY_USED",
  "message": "This invitation has already been accepted. Please log in to your account",
  "data": null
}
```

**UX Action:** Show message + redirect to login page

---

### **Scenario C: Email Not Verified**

**User:**  
As a Guru, I want to see I must verify email so I can continue.

**Trigger:** User hasn't completed email verification; tries to create application

**API Response:**
```json
{
  "error": true,
  "status": 403,
  "code": "EMAIL_NOT_VERIFIED",
  "message": "Please verify your email first before proceeding. Check your inbox for the OTP.",
  "data": {
    "userId": "user_12345",
    "email": "guru@example.com",
    "emailStatus": "pending"
  }
}
```

**UX Action:** Show verification screen + resend OTP option

---

### **Scenario D: Access Denied**

**User:**  
As a user, I want access denied if I try to open Guru screens without the Guru role.

**Trigger:** Non-guru user tries to access `/api/gurus/me` or marketing hub

**API Response:**
```json
{
  "error": true,
  "status": 403,
  "code": "ACCESS_DENIED",
  "message": "You do not have permission to access this resource. Only Gurus can access the Guru Portal.",
  "data": null
}
```

**UX Action:** Redirect to appropriate dashboard based on actual role (buyer/promoter)

---

## Database Requirements

### New Tables Required

```sql
-- guru_invites (already exists)
-- guru_applications (already exists)
-- guru_levels (already exists)

-- NEW: guru_marketing_hub content management
CREATE TABLE guru_content_submissions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  guru_user_id BIGINT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  content_type VARCHAR(50), -- 'image', 'video', 'copy', 'social_post'
  content_url TEXT,
  tags JSONB,
  status VARCHAR(50) DEFAULT 'pending_review', -- 'pending_review', 'approved', 'rejected'
  submitted_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by BIGINT REFERENCES users(id),
  rejection_reason TEXT,
  shared_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE guru_campaign_requests (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  guru_user_id BIGINT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  asset_type VARCHAR(50),
  target_audience TEXT,
  estimated_credits_needed INT,
  status VARCHAR(50) DEFAULT 'pending',
  requested_at TIMESTAMP,
  completed_at TIMESTAMP,
  credits_used INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE guru_sprint_mode (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  guru_user_id BIGINT NOT NULL REFERENCES users(id),
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Existing tables with new columns
-- Add to guru_levels:
-- - achievement_date TIMESTAMP
-- - performance_metrics JSONB
```

---

## Implementation Notes

### Required Middleware

- `requireAuth` - JWT validation (existing)
- `requireRole('guru')` - Check user role == 'guru' (existing)
- `requireGuru` - Check active guru status (existing)
- `requireActiveGuru` - Check activation complete (existing)

### Authentication Flow

1. **Invite Validation** → validate token before signup
2. **Signup** → include invite_token in request
3. **Email Verification** → OTP sent and verified
4. **Application** → create with terms agreed
5. **Activation Fee** → commit payment choice
6. **Admin Approval** → network manager or admin approves
7. **Role Assignment** → user.role = 'guru'
8. **Session Management** → JWT with guru role included

### Key Constraints

- ✅ Invites are single-use and expiring
- ✅ Email must be verified before application
- ✅ Activation fee must be committed before approval
- ✅ 12-month contract from activation
- ✅ Level 3 only available via Sprint Mode from Level 2
- ✅ Cash withdrawal locked until Level 3
- ✅ All endpoints require guru role + active status

---

**End of Documentation**  
For questions or updates, contact: backend@eventopia.com
