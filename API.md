# API Reference (Stellar Multi-Sig Safe)

## Overview

Base URL for development: `http://localhost:5001/api`

**API Versioning**: This API uses versioned endpoints. All requests must specify a version:
- **Current Version**: `/api/v2/` (recommended)
- **Legacy Version**: `/api/v1/` (deprecated)

Authentication: JWT in `Authorization: Bearer <token>` header for protected routes.

404 fallback: unknown routes respond with `{ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }`.

### Versioning Methods

1. **Path-based (Recommended)**: `/api/v2/health`, `/api/v1/health`
2. **Header-based**: `Accept-Version: v2` or `API-Version: v2`
3. **Priority**: Path > Accept-Version > API-Version > Default

For detailed versioning information, see [API_VERSIONING.md](./API_VERSIONING.md).

---

## 1. Health Check

### GET /api/v2/health
### GET /api/v1/health

**v2 Response (Enhanced)**:
- 200
- body:
  ```json
  {
    "success": true,
    "data": {
      "status": "UP",
      "timestamp": "...",
      "version": "2.0.0",
      "apiVersion": "v2",
      "versionInfo": {
        "requestedVersion": "v2",
        "resolvedVersion": "v2",
        "isDeprecated": false,
        "deprecationDate": null,
        "sunsetDate": null
      },
      "features": {
        "versioning": true,
        "deprecationWarnings": true,
        "headerNegotiation": true,
        "pathVersioning": true
      },
      "supportedVersions": ["v1", "v2"],
      "recommendedVersion": "v2"
    },
    "links": {
      "self": "/api/v2/health",
      "documentation": "/api/v2/docs",
      "versionInfo": "/api/v2/version"
    }
  }
  ```

**v1 Response (Legacy)**:
- 200
- body:
  ```json
  {
    "success": true,
    "data": {
      "status": "UP",
      "timestamp": "...",
      "version": "1.0.0"
    }
  }
  ```

### GET /api/v2/health/version (v2 only)

Get detailed version information and deprecation status.

Response:
- 200
- body:
  ```json
  {
    "success": true,
    "data": {
      "currentVersion": "v2",
      "requestedVersion": "v2",
      "resolvedVersion": "v2",
      "isDeprecated": false,
      "deprecationDate": null,
      "sunsetDate": null,
      "supportedVersions": ["v1", "v2"],
      "recommendedVersion": "v2",
      "versioningMethods": {
        "path": "GET /api/v1/health or /api/v2/health",
        "header": "Accept-Version: v1 or API-Version: v2"
      },
      "migration": {
        "from": "v1",
        "to": "v2",
        "breakingChanges": [
          "Response format includes additional version metadata",
          "New endpoints available in v2",
          "Some v1 endpoints will be deprecated"
        ],
        "migrationGuide": "https://docs.example.com/migration/v1-to-v2"
      }
    }
  }
  ```

---

## 2. Auth

### GET /api/v2/auth/challenge
### GET /api/v1/auth/challenge

Query parameters:
- `account` (string, required)

Response:
- 200:
  ```json
  {
    "success": true,
    "data": {
      "challenge_xdr": "...",
      "network": "futurenet"
    }
  }
  ```

### POST /api/v2/auth/login
### POST /api/v1/auth/login

Body:
- `transaction` (string, signed SEP-10 XDR, required)

Response:
- 200:
  ```json
  {
    "success": true,
    "data": {
      "token": "<jwt>",
      "user": { "id": "...", "stellarAddress": "...", "email": "..." }
    },
    "message": "Authentication successful"
  }
  ```

---

## 3. Wallets (Authenticated)

All routes require `Authorization: Bearer <token>`.

### POST /api/v2/wallets
### POST /api/v1/wallets

Body:
- `name` (string, 1-100)
- `owners` (array of Stellar addresses, 1-10)
- `threshold` (int, 1-10)
- `recoveryAddress` (Stellar address)
- `recoveryDelay` (int >= 86400 seconds)

### GET /api/v2/wallets
### GET /api/v1/wallets

Query:
- `page` (int, optional)
- `limit` (int, optional)

### GET /api/v2/wallets/:walletId
### GET /api/v1/wallets/:walletId

Path params:
- `walletId` (UUID)

### PUT /api/v2/wallets/:walletId
### PUT /api/v1/wallets/:walletId

Body (optional):
- `name` (string, 1-100)

### POST /api/v2/wallets/:walletId/owners
### POST /api/v1/wallets/:walletId/owners

Body:
- `ownerAddress` (Stellar address)

### DELETE /api/v2/wallets/:walletId/owners/:ownerAddress
### DELETE /api/v1/wallets/:walletId/owners/:ownerAddress

Path params: `walletId`, `ownerAddress`

### PUT /api/v2/wallets/:walletId/threshold
### PUT /api/v1/wallets/:walletId/threshold

Body:
- `threshold` (int, 1-10)

### PUT /api/v2/wallets/:walletId/recovery
### PUT /api/v1/wallets/:walletId/recovery

Body:
- `recoveryAddress` (Stellar address)
- `recoveryDelay` (int >= 86400)

### GET /api/v2/wallets/:walletId/balance
### GET /api/v1/wallets/:walletId/balance

### GET /api/v2/wallets/:walletId/transactions
### GET /api/v1/wallets/:walletId/transactions

Query:
- `page`, `limit` (optional)
- `status` (pending|executed|expired)

### GET /api/v2/wallets/:walletId/export
### GET /api/v1/wallets/:walletId/export

Query:
- `format` (json|csv)

### POST /api/v2/wallets/import
### POST /api/v1/wallets/import

Body:
- `walletData` (object)
- `format` (json|csv)

---

## 4. Transaction Proposals (Authenticated)

All routes require `Authorization: Bearer <token>`.

### POST /api/v2/transactions
### POST /api/v1/transactions

Body:
- `walletId` (UUID)
- `destination` (string)
- `amount` (string/number)
- `title` (string, 1-200)
- `description` (string, max 5000)
- `data` (string, optional)
- `expiresAt` (ISO8601)

### PUT /api/v2/transactions/:transactionId/metadata
### PUT /api/v1/transactions/:transactionId/metadata

Body (optional):
- `title` (string, 1-200)
- `description` (string, max 5000)

### GET /api/v2/transactions
### GET /api/v1/transactions

Query:
- `q` (string, search)
- `page`, `limit` (pagination)
- `status` (pending|executed|expired)

### GET /api/v2/transactions/:transactionId
### GET /api/v1/transactions/:transactionId

### POST /api/v2/transactions/:transactionId/comments
### POST /api/v1/transactions/:transactionId/comments

Body:
- `content` (string, 1-1000)

### DELETE /api/v2/transactions/:transactionId
### DELETE /api/v1/transactions/:transactionId

### POST /api/v2/transactions/:transactionId/intent-to-sign
### POST /api/v1/transactions/:transactionId/intent-to-sign

Body (optional):
- `signature` (string)

Rate limited via `signatureRateLimiter`.

---

## 5. User (Authenticated)

All routes require `Authorization: Bearer <token>`.

### GET /api/v2/user/profile
### GET /api/v1/user/profile

### GET /api/v2/user/discovery
### GET /api/v1/user/discovery

### PUT /api/v2/user/preferences
### PUT /api/v1/user/preferences

Body (optional):
- `emailNotifications` (boolean)
- `pushNotifications` (boolean)
- `theme` (dark|light|system)

### PUT /api/v2/user/wallets/:walletId/settings
### PUT /api/v1/user/wallets/:walletId/settings

Body (optional):
- `nickname` (string)
- `isFavorite` (boolean)
- `isPinned` (boolean)

### POST /api/v2/user/invitations
### POST /api/v1/user/invitations

Body:
- `walletId` (UUID)
- `inviteeAddress` (string)

---

## 6. Token (Authenticated)

All routes require `Authorization: Bearer <token>`.

### GET /api/v2/token/balances/:walletAddress
### GET /api/v1/token/balances/:walletAddress

### GET /api/v2/token/prices
### GET /api/v1/token/prices

Query:
- `symbols` (string, optional comma-separated)

### GET /api/v2/token/portfolio/:walletAddress
### GET /api/v1/token/portfolio/:walletAddress

### GET /api/v2/token/discover/:walletAddress
### GET /api/v1/token/discover/:walletAddress

### GET /api/v2/token/transactions/:walletAddress
### GET /api/v1/token/transactions/:walletAddress

Query:
- `page`, `limit` (optional)
- `type` (string, optional)

---

## 7. Event Indexer (Authenticated)

All routes require `Authorization: Bearer <token>`.

### GET /api/v2/events/stats
### GET /api/v1/events/stats

### GET /api/v2/events/contract/:contractId
### GET /api/v1/events/contract/:contractId

Query:
- `limit` (int, optional)

### GET /api/v2/events/address/:address
### GET /api/v1/events/address/:address

Query:
- `limit` (int, optional)

### POST /api/v2/events/backfill
### POST /api/v1/events/backfill

Body:
- `fromLedger` (int)
- `toLedger` (int)

### POST /api/v2/events/reorg
### POST /api/v1/events/reorg

Body:
- `ledger` (int)

---

## 8. Recovery

In `src/index.ts`, `/api/recovery` is mounted, but `backend/src/routes/recovery.ts` is not present in this code snapshot. Add the route file or fix `index.ts` reference as needed.

---

## 9. Common Response Pattern

Success:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional status message"
}
```

Error:
```json
{
  "success": false,
  "error": { "code": "...", "message": "..." }
}
```

---

## 10. Notes

- `validateRequest` returns `400` with validation message when request payload/params are invalid.
- Rate-limited endpoints return `429` when limit is exceeded.
- Auth middleware returns `401` when token is invalid/missing.
