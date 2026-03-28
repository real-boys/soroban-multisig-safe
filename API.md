# API Reference (Stellar Multi-Sig Safe)

## Overview

Base URL for development: `http://localhost:5001/api`

Authentication: JWT in `Authorization: Bearer <token>` header for protected routes.

404 fallback: unknown routes respond with `{ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }`.

---

## 1. Health Check

### GET /api/health

Response:
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

---

## 2. Auth

### GET /api/auth/challenge

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

### POST /api/auth/login

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

### POST /api/wallets

Body:
- `name` (string, 1-100)
- `owners` (array of Stellar addresses, 1-10)
- `threshold` (int, 1-10)
- `recoveryAddress` (Stellar address)
- `recoveryDelay` (int >= 86400 seconds)

### GET /api/wallets

Query:
- `page` (int, optional)
- `limit` (int, optional)

### GET /api/wallets/:walletId

Path params:
- `walletId` (UUID)

### PUT /api/wallets/:walletId

Body (optional):
- `name` (string, 1-100)

### POST /api/wallets/:walletId/owners

Body:
- `ownerAddress` (Stellar address)

### DELETE /api/wallets/:walletId/owners/:ownerAddress

Path params: `walletId`, `ownerAddress`

### PUT /api/wallets/:walletId/threshold

Body:
- `threshold` (int, 1-10)

### PUT /api/wallets/:walletId/recovery

Body:
- `recoveryAddress` (Stellar address)
- `recoveryDelay` (int >= 86400)

### GET /api/wallets/:walletId/balance

### GET /api/wallets/:walletId/transactions

Query:
- `page`, `limit` (optional)
- `status` (pending|executed|expired)

### GET /api/wallets/:walletId/export

Query:
- `format` (json|csv)

### POST /api/wallets/import

Body:
- `walletData` (object)
- `format` (json|csv)

---

## 4. Transaction Proposals (Authenticated)

All routes require `Authorization: Bearer <token>`.

### POST /api/transactions

Body:
- `walletId` (UUID)
- `destination` (string)
- `amount` (string/number)
- `title` (string, 1-200)
- `description` (string, max 5000)
- `data` (string, optional)
- `expiresAt` (ISO8601)

### PUT /api/transactions/:transactionId/metadata

Body (optional):
- `title` (string, 1-200)
- `description` (string, max 5000)

### GET /api/transactions

Query:
- `q` (string, search)
- `page`, `limit` (pagination)
- `status` (pending|executed|expired)

### GET /api/transactions/:transactionId

### POST /api/transactions/:transactionId/comments

Body:
- `content` (string, 1-1000)

### DELETE /api/transactions/:transactionId

### POST /api/transactions/:transactionId/intent-to-sign

Body (optional):
- `signature` (string)

Rate limited via `signatureRateLimiter`.

---

## 5. User (Authenticated)

All routes require `Authorization: Bearer <token>`.

### GET /api/user/profile

### GET /api/user/discovery

### PUT /api/user/preferences

Body (optional):
- `emailNotifications` (boolean)
- `pushNotifications` (boolean)
- `theme` (dark|light|system)

### PUT /api/user/wallets/:walletId/settings

Body (optional):
- `nickname` (string)
- `isFavorite` (boolean)
- `isPinned` (boolean)

### POST /api/user/invitations

Body:
- `walletId` (UUID)
- `inviteeAddress` (string)

---

## 6. Token (Authenticated)

All routes require `Authorization: Bearer <token>`.

### GET /api/token/balances/:walletAddress

### GET /api/token/prices

Query:
- `symbols` (string, optional comma-separated)

### GET /api/token/portfolio/:walletAddress

### GET /api/token/discover/:walletAddress

### GET /api/token/transactions/:walletAddress

Query:
- `page`, `limit` (optional)
- `type` (string, optional)

---

## 7. Event Indexer (Authenticated)

All routes require `Authorization: Bearer <token>`.

### GET /api/events/stats

### GET /api/events/contract/:contractId

Query:
- `limit` (int, optional)

### GET /api/events/address/:address

Query:
- `limit` (int, optional)

### POST /api/events/backfill

Body:
- `fromLedger` (int)
- `toLedger` (int)

### POST /api/events/reorg

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
