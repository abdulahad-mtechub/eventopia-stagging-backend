# Postman Collection Setup Guide - Guru Auth Module

## 📥 Import Instructions

### Step 1: Download the Collection
The collection file is: **`Eventopia_Guru_Auth_API.postman_collection.json`**

### Step 2: Import into Postman

**Option A: Desktop Postman**
1. Open Postman application
2. Click **Import** button (top-left)
3. Select **File** tab
4. Choose `Eventopia_Guru_Auth_API.postman_collection.json`
5. Click **Import**

**Option B: Web Version**
1. Go to [postman.com](https://postman.com)
2. Sign in to your account
3. Click **Import** in the top-left
4. Upload the JSON file
5. Select workspace to import into

---

## ⚙️ Environment Setup

### Step 1: Create Environment Variables

The collection uses placeholder variables that you need to configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | Your backend API base URL |
| `ACCESS_TOKEN` | *(empty)* | JWT access token (get from login) |
| `REFRESH_TOKEN` | *(empty)* | JWT refresh token (get from login) |
| `INVITE_TOKEN` | `abc123def456` | Guru invitation token |
| `USER_ID` | `user_12345` | Example user ID |
| `NETWORK_MANAGER_ID` | `nm_user_123` | Example network manager ID |
| `PROMOTER_ID` | `promoter_789` | Example promoter ID |
| `APPLICATION_ID` | `app_guru_456` | Example application ID |
| `BUYER_TOKEN` | *(empty)* | Non-guru user token (for error tests) |

### Step 2: Update Variables

1. Click the **Environment** icon (top-right, looks like an eye)
2. Click **Environments** in the dropdown
3. Click **Globals** or create new environment
4. Update each variable with your actual values:
   - `BASE_URL`: Your backend address (e.g., `http://localhost:3000` or production URL)
   - `INVITE_TOKEN`: Get from your admin/database
   - After first login, copy `ACCESS_TOKEN` and `REFRESH_TOKEN` from response

---

## 🚀 Quick Start Workflow

### Complete Registration Flow (13 Screens)

Follow these requests in order:

#### Phase 1: Invite & Signup
1. **Validate Invite Token** → `1. Invite Validation` → `Validate Invite Token`
   - Updates `INVITE_TOKEN` variable if needed
   - Check it's valid and not expired

2. **Register** → `2. Authentication` → `Register New User`
   - Copies `ACCESS_TOKEN` from response (use Tests tab script)
   - Email must match invite

3. **Verify Email** → `3. Email Verification` → `Verify Email with OTP`
   - Enter OTP from email (find in test environment)

#### Phase 2: Application & Activation
4. **Create Application** → `4. Guru Application` → `Create Guru Application`
   - Accepts terms of service
   - Creates pending application

5. **View License** → `5. License Information` → `Get License Info`
   - Shows contract terms and fee details

6. **Commit Activation Fee** → `6. Activation Fee` → `Commit Activation Fee (Upfront)`
   - Select payment method

7. **Check Application Status** → `4. Guru Application` → `Get My Application`
   - Await admin approval (manual step)

#### Phase 3: Portal Entry & Setup
8. **Get Profile** → `8. Guru Portal` → `Get Guru Profile`
   - Confirm guru role activated

9. **Get Onboarding Checklist** → `9. Onboarding Checklist` → `Get Onboarding Checklist`
   - See first-time tasks

10. **Get Referral Info** → `10. Referral Tools` → `Get Referral Info`
    - Get referral link/code for recruiting

11. **Access Marketing Hub** → `11. Marketing Hub` → `Get Marketing Hub Structure`
    - Explore 4 main sections

12. **View Promoters** → `12. My Promoters` → `Get Attached Promoters`
    - See network (empty if just started)

13. **Check Performance** → `13. Performance & Levels` → `Get Level Information`
    - View level framework and progress

---

## 🔄 Using the Collection

### Collection Structure

Requests are organized by feature:

```
├── 1. Invite Validation
├── 2. Authentication (Register/Login)
├── 3. Email Verification
├── 4. Guru Application & Terms
├── 5. License Information
├── 6. Activation Fee & Commits
├── 7. User & Role Management
├── 8. Guru Portal & Profile
├── 9. Onboarding Checklist
├── 10. Referral Tools
├── 11. Marketing Hub
├── 12. My Promoters
├── 13. Performance & Levels
├── Flow A: Content Submission & Review
├── Flow B: Leaderboard & Performance
├── Flow D: Campaign Requests
├── Flow E: Sprint Mode (Level 3 Progression)
└── Error Scenarios & Testing
```

### Making Requests

1. **Select a request** from the collection
2. **Review the URL** (uses {{VARIABLES}})
3. **Update body** (if applicable) - defaults are provided
4. **Click Send**
5. **Check response** in the Response panel

### Auto-extracting Tokens

After login/register, manually:
1. Copy `accessToken` from response
2. Paste into `ACCESS_TOKEN` environment variable
3. All subsequent authenticated requests will use it

**Better:** Use Tests tab to auto-extract:
```javascript
if (pm.response.code === 201 || pm.response.code === 200) {
    let data = pm.response.json().data;
    if (data.accessToken) {
        pm.environment.set("ACCESS_TOKEN", data.accessToken);
        pm.environment.set("REFRESH_TOKEN", data.refreshToken);
    }
}
```

---

## 🧪 Testing Each Flow

### Flow A: Content Submission
1. **Submit Content** → Submit marketing asset for review
2. **Get Submissions** → View submission status (pending/approved/rejected)
3. **Filter by status** → See only pending submissions

### Flow B: Leaderboard
1. **Get Leaderboard** → View top performers by month/year/all-time
2. **Compare your rank** → Level, promoters, tickets sold, commissions

### Flow D: Campaign Requests
1. **Create Request** → Request custom assets (monetised via credits)
2. **Get Requests** → View request history and credit usage

### Flow E: Sprint Mode (Level 2+ only)
1. **Get Sprint Mode** → View 90-day progression window to Level 3
2. **Check targets** → Ticket and performance milestones
3. **Path to cash withdrawal** → Only available at Level 3

---

## ⚠️ Error Testing

### Test Each Failure Scenario

Folder: **Error Scenarios & Testing**

| Scenario | Endpoint | Expected Status | Error Code |
|----------|----------|-----------------|-----------|
| A: Invite Expired | GET `/invites/validate/expired_token` | 410 | `INVITE_EXPIRED` |
| B: Invite Already Used | GET `/invites/validate/used_token` | 409 | `INVITE_ALREADY_USED` |
| C: Email Not Verified | POST `/applications` (unverified user) | 403 | `EMAIL_NOT_VERIFIED` |
| D: Access Denied | GET `/gurus/me` (buyer token) | 403 | `ACCESS_DENIED` |

---

## 🔐 Authentication

### Bearer Token Setup

Collection has Bearer token authentication pre-configured:
- Token variable: `{{ACCESS_TOKEN}}`
- All requests with "Authorization" header use Bearer token automatically

### Adding Token to Requests

Most requests are pre-configured. To add to a new request:
1. Go to request → **Auth** tab
2. Select **Bearer Token**
3. Paste token or use `{{ACCESS_TOKEN}}`

---

## 📊 Database Test Data

Before running flows, ensure you have test data:

### Required Data
- ✅ Valid guru invite token (use admin panel or database)
- ✅ Network manager user (create if missing)
- ✅ Email configured for OTP testing

### Create Test Data
```sql
-- Create test invite
INSERT INTO guru_invites (invite_token, email, role, expires_at)
VALUES ('test_token_abc123', 'test@example.com', 'guru', NOW() + interval '30 days');

-- Get invite for testing
SELECT * FROM guru_invites WHERE invite_token = 'test_token_abc123';
```

---

## 🐛 Common Issues

### "Invalid Token" Error
- ❌ Token expired (JWT expires in 24h typically)
- ✅ Solution: Login again, copy new token, update `ACCESS_TOKEN`

### "Email Not Verified"
- ❌ Try to create application without verifying email first
- ✅ Solution: Complete email verification step

### "Invite Expired"
- ❌ Invite token older than 30 days
- ✅ Solution: Request new invite from admin

### "Network Manager Not Found"
- ❌ Invalid `network_manager_user_id` in application request
- ✅ Solution: Use valid network manager ID from database

### "Not Found" (404)
- ❌ Using wrong user ID, promoter ID, or application ID
- ✅ Solution: Copy IDs from previous response data

---

## 💡 Tips & Tricks

### Organize with Folders
- Create folders for different test scenarios
- Group related requests together
- Right-click folder → "Set as current"

### Use Pre-request Scripts
- Automatically set timestamps
- Generate dynamic test data
- Validate before sending

### Reuse Response Data
Extract values from responses:
```javascript
// In Tests tab
let resp = pm.response.json();
pm.environment.set("GURU_ID", resp.data.userId);
```

### Collection Variables
- For shared values across all requests
- Override in Environment for specific test runs
- Use {{VAR}} syntax in URLs/bodies

### Run Collections
- **Runner**: Automate sequence of requests
- **Monitor**: Schedule periodic testing
- **CI/CD**: Integrate with Jenkins/GitHub Actions

---

## 📞 Support

If you encounter issues:

1. **Check BASE_URL** - Must match your backend
2. **Verify tokens** - Copy exact value from response
3. **Check database** - Ensure test data exists
4. **Review response** - Error messages indicate what's wrong
5. **Consult docs** - See GURU_AUTH_FLOW_COMPLETE.md for endpoint details

---

## 🎯 Next Steps

1. ✅ Import collection into Postman
2. ✅ Set up environment variables
3. ✅ Create test data in database
4. ✅ Run complete registration flow (13 screens)
5. ✅ Test each client flow (A, B, D, E)
6. ✅ Verify error scenarios work as expected
7. ✅ Share collection with frontend team

**Happy Testing! 🚀**
