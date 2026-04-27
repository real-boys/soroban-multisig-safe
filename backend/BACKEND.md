# Backend Documentation - Stellar Multi-Sig Safe

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites & Setup](#prerequisites--setup)
4. [Project Structure](#project-structure)
5. [Configuration](#configuration)
6. [API Routes](#api-routes)
7. [Services](#services)
8. [Controllers](#controllers)
9. [Database Schema](#database-schema)
10. [Middleware](#middleware)
11. [Development Workflow](#development-workflow)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Troubleshooting](#troubleshooting)

---

## Overview

The backend is a Node.js/Express API server that powers the Stellar Multi-Sig Safe application. It handles:

- **User authentication** via SEP-10 (Stellar Authentication)
- **Multi-signature wallet management** and contract interaction
- **Transaction proposal creation, signing, and execution**
- **Real-time event indexing** from the Stellar blockchain
- **Analytics and reporting** for wallet activities
- **Resource management** (TTL extension, rent management)
- **High availability** with RPC load balancing
- **Real-time updates** via WebSockets (Socket.IO)

### Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Cache**: Redis
- **Blockchain**: Stellar SDK / Soroban SDK
- **Real-time**: Socket.IO
- **Logging**: Winston + ELK Stack support
- **Job Queue**: Bull
- **Authentication**: JWT + SEP-10

---

## Architecture

### Layered Architecture Overview

```
┌─────────────────────────────────────────┐
│          Client Applications            │
│   (Frontend, Mobile, External APIs)     │
└──────────────┬──────────────────────────┘
               │ HTTP/WebSocket
┌──────────────▼──────────────────────────┐
│          Express.js Server              │
│  - Route Handlers                       │
│  - Middleware Stack                     │
│  - Error Handling                       │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴─────────┬──────────────┬──────────────┐
        │                │              │              │
   ┌────▼─────┐    ┌────▼──────┐  ┌───▼────┐  ┌─────▼──────┐
   │Controllers│    │ Services  │  │Manager │  │  WebSocket │
   │           │    │           │  │ Tasks  │  │  Handlers  │
   └────┬──────┘    └────┬──────┘  └───┬────┘  └─────┬───────┘
        │                │             │             │
        └────────────────┼─────────────┼─────────────┘
                         │
                ┌────────┴────────┬────────────┐
                │                 │            │
           ┌────▼─────┐      ┌───▼───┐   ┌───▼──────┐
           │PostgreSQL│      │ Redis │   │  Stellar │
           │Database  │      │ Cache │   │Blockchain│
           └──────────┘      └───────┘   └──────────┘
```

### Request Flow

```
Request → Middleware Stack → Route Handler → Controller → Service → Database/Blockchain → Response
  ↓           ↓
[CORS]    [Auth Check]
[Compression]
[Rate Limit]
[JSON Parser]
[Error Handling]
```

---

## Prerequisites & Setup

### System Requirements
- **Node.js**: v18 or higher
- **npm**: v9 or higher (or Yarn)
- **PostgreSQL**: v15 or higher
- **Redis**: v7 or higher
- **Git**: For version control
- **Docker** (optional): For containerized deployment

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd soroban-multisig-safe/backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**
   ```bash
   cp .env.example .env
   ```
   
   See [Configuration](#configuration) section for required variables.

4. **Database Setup**
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run migrations
   npm run db:migrate
   
   # Seed database (optional)
   npm run db:seed
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

   The server will be available at `http://localhost:5001`

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts                          # Entry point
│   │
│   ├── config/                           # Configuration modules
│   │   ├── database.ts                   # Prisma & DB connection
│   │   └── redis.ts                      # Redis client setup
│   │
│   ├── controllers/                      # Route handlers (business logic)
│   │   ├── AuthController.ts             # Authentication endpoints
│   │   ├── WalletController.ts           # Wallet management
│   │   ├── TransactionController.ts      # Transaction proposals
│   │   ├── UserController.ts             # User profile & settings
│   │   ├── TokenController.ts            # Token operations
│   │   ├── AnalyticsController.ts        # Analytics data
│   │   ├── EventIndexerController.ts     # Event indexing
│   │   └── SecurityController.ts         # Security operations
│   │
│   ├── services/                         # Business logic & external APIs
│   │   ├── AuthService.ts                # SEP-10 & JWT auth
│   │   ├── WalletService.ts              # Wallet CRUD & contract interaction
│   │   ├── TransactionService.ts         # Transaction proposals & signing
│   │   ├── StellarService.ts             # Stellar blockchain interaction
│   │   ├── TokenService.ts               # Token operations
│   │   ├── EventIndexerService.ts        # Blockchain event tracking
│   │   ├── AnalyticsService.ts           # Analytics calculations
│   │   ├── EmailService.ts               # Email notifications
│   │   ├── PDFExportService.ts           # PDF generation
│   │   ├── ExportService.ts              # Data export (CSV, JSON)
│   │   ├── CronService.ts                # Scheduled tasks
│   │   ├── DatabaseBackupService.ts      # Automated backups
│   │   ├── ResourceMonitor.ts            # Resource usage monitoring
│   │   ├── RPCLoadBalancer.ts            # RPC endpoint load balancing
│   │   ├── IndexerHealthChecker.ts       # Health monitoring
│   │   ├── SyncLagAlertService.ts        # Sync lag notifications
│   │   ├── HeartbeatService.ts           # System heartbeat
│   │   ├── RelayService.ts               # Transaction relay
│   │   ├── ChartService.ts               # Chart data generation
│   │   └── socketService.ts              # WebSocket event handlers
│   │
│   ├── routes/                           # Route definitions
│   │   ├── auth.ts                       # POST /api/auth/*
│   │   ├── wallet.ts                     # GET/POST /api/wallets/*
│   │   ├── transaction.ts                # GET/POST /api/transactions/*
│   │   ├── user.ts                       # GET/PUT /api/user/*
│   │   ├── token.ts                      # GET/POST /api/token/*
│   │   ├── analytics.ts                  # GET /api/analytics/*
│   │   ├── eventIndexer.ts               # GET /api/events/*
│   │   └── health.ts                     # GET /api/health/*
│   │
│   ├── middleware/                       # Express middleware
│   │   ├── auth.ts                       # JWT authentication
│   │   ├── errorHandler.ts               # Global error handler
│   │   ├── rateLimiter.ts                # Rate limiting
│   │   └── validation.ts                 # Request validation
│   │
│   ├── types/                            # TypeScript interfaces
│   │   └── api.ts                        # API request/response types
│   │
│   └── utils/                            # Utility functions
│       └── logger.ts                     # Winston logger configuration
│
├── prisma/
│   ├── schema.prisma                     # Database schema definition
│   ├── seed.ts                           # Database seeding script
│   └── migrations/                       # Database migration files
│
├── tests/                                # Test files (Jest)
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── .env.example                          # Environment template
├── .env                                  # Local environment (git ignored)
├── Dockerfile                            # Docker container definition
├── docker-compose.yml                    # Docker Compose configuration
├── package.json                          # NPM dependencies & scripts
├── tsconfig.json                         # TypeScript configuration
├── jest.config.js                        # Jest test configuration
├── eslint.config.js                      # ESLint configuration
└── README.md                             # Backend README
```

---

## Configuration

### Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

```bash
# Server Configuration
NODE_ENV=development                      # development | staging | production
PORT=5001                                 # Server port

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/multisig_safe

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Stellar Configuration
HORIZON_URL=https://horizon-futurenet.stellar.org    # Horizon API endpoint
STELLAR_NETWORK_PASSPHRASE=Test SDF Future Network    # Network identifier
STELLAR_NETWORK=futurenet                            # mainnet | testnet | futurenet

# Authentication
JWT_SECRET=your-super-secret-key          # JWT signing secret (use strong key in production)
JWT_EXPIRES_IN=24h                        # Token expiration time
APP_DOMAIN=localhost                      # App domain for SEP-10
AUTH_DOMAIN=localhost                     # Auth domain for SEP-10
SERVER_SECRET_KEY=your-server-key         # Server signing key (optional, auto-generated if missing)

# Frontend Configuration
FRONTEND_URL=http://localhost:3000        # Frontend URL for CORS

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@multisig-safe.com

# RPC Load Balancing
RPC_ENDPOINTS=https://rpc1.example.com,https://rpc2.example.com

# Logging
LOG_LEVEL=debug                           # error | warn | info | http | debug
LOG_FORMAT=json                           # json | text

# ELK Stack (Optional)
ELK_HOST=localhost
ELK_PORT=9200
ELK_ENABLED=false

# Feature Flags
ENABLE_ANALYTICS=true
ENABLE_EVENT_INDEXING=true
ENABLE_RATE_LIMITING=true
ENABLE_BACKUPS=true
```

### Database Connection

Update `DATABASE_URL` in `.env`:

```bash
# PostgreSQL Local
DATABASE_URL=postgresql://postgres:password@localhost:5432/multisig_safe

# PostgreSQL Docker
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/multisig_safe

# With SSL
DATABASE_URL=postgresql://user:password@host:5432/db?sslmode=require
```

### Redis Connection

Update `REDIS_URL` in `.env`:

```bash
# Local Redis
REDIS_URL=redis://localhost:6379

# Redis with password
REDIS_URL=redis://:password@localhost:6379

# Redis cluster
REDIS_URL=redis://node1:6379,redis://node2:6379,redis://node3:6379
```

---

## API Routes

### Authentication Routes (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/auth/challenge` | Generate SEP-10 authentication challenge | ❌ |
| POST | `/auth/verify` | Verify challenge and issue JWT | ❌ |
| POST | `/auth/refresh` | Refresh JWT token | ✅ |
| POST | `/auth/logout` | Logout and invalidate session | ✅ |

**Example Requests:**

```bash
# Get Challenge
curl -X POST http://localhost:5001/api/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{"account":"GXXXXX"}'

# Verify Challenge
curl -X POST http://localhost:5001/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeXdr":"AAAAAgAAAA..."}'

# Refresh Token
curl -X POST http://localhost:5001/api/auth/refresh \
  -H "Authorization: Bearer <token>"
```

---

### Wallet Routes (`/api/wallets`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/wallets` | List user wallets | ✅ |
| POST | `/wallets` | Create new multi-sig wallet | ✅ |
| GET | `/wallets/:id` | Get wallet details | ✅ |
| PUT | `/wallets/:id` | Update wallet settings | ✅ |
| DELETE | `/wallets/:id` | Remove wallet | ✅ |
| GET | `/wallets/:id/members` | List wallet signers | ✅ |
| POST | `/wallets/:id/members` | Add signer | ✅ |
| DELETE | `/wallets/:id/members/:memberId` | Remove signer | ✅ |

**Example Requests:**

```bash
# List Wallets
curl -X GET http://localhost:5001/api/wallets \
  -H "Authorization: Bearer <token>"

# Create Wallet
curl -X POST http://localhost:5001/api/wallets \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Multi-Sig Safe",
    "threshold": 2,
    "signers": ["GXXXXXX", "GYYYYYY"],
    "recoveryAddress": "GZZZZZ"
  }'
```

---

### Transaction Routes (`/api/transactions`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/transactions` | List proposals | ✅ |
| POST | `/transactions` | Create proposal | ✅ |
| GET | `/transactions/:id` | Get proposal details | ✅ |
| POST | `/transactions/:id/sign` | Sign proposal | ✅ |
| POST | `/transactions/:id/execute` | Execute proposal | ✅ |
| POST | `/transactions/:id/reject` | Reject proposal | ✅ |
| GET | `/transactions/:id/signatures` | List signatures | ✅ |

**Example Requests:**

```bash
# Create Transaction Proposal
curl -X POST http://localhost:5001/api/transactions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "wallet_id",
    "to": "GXXXXXX",
    "amount": "100.50",
    "memo": "Payment for services"
  }'

# Sign Proposal
curl -X POST http://localhost:5001/api/transactions/:id/sign \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"signature": "....."}'
```

---

### User Routes (`/api/user`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/user/profile` | Get user profile | ✅ |
| PUT | `/user/profile` | Update profile | ✅ |
| GET | `/user/preferences` | Get settings | ✅ |
| PUT | `/user/preferences` | Update settings | ✅ |
| GET | `/user/sessions` | List active sessions | ✅ |
| DELETE | `/user/sessions/:id` | Revoke session | ✅ |

---

### Analytics Routes (`/api/analytics`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/analytics/dashboard` | Dashboard statistics | ✅ |
| GET | `/analytics/transactions` | Transaction trends | ✅ |
| GET | `/analytics/signers` | Signer statistics | ✅ |
| GET | `/analytics/export` | Export analytics data | ✅ |
| GET | `/analytics/charts` | Chart data | ✅ |

---

### Event Indexer Routes (`/api/events`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/events` | List indexed events | ✅ |
| GET | `/events/sync-status` | Event sync status | ✅ |
| GET | `/events/health` | Indexer health | ❌ |
| POST | `/events/reindex` | Trigger reindexing | ✅ |

---

### Health Routes (`/api/health`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/health` | Server health check | ❌ |
| GET | `/health/db` | Database status | ❌ |
| GET | `/health/cache` | Redis status | ❌ |
| GET | `/health/blockchain` | Blockchain connectivity | ❌ |

---

## Services

### AuthService
**File**: `src/services/AuthService.ts`

Handles SEP-10 (Stellar Authentication Protocol) authentication:
- Generates challenge transactions
- Verifies challenge responses
- Issues JWT tokens
- Manages refresh tokens

```typescript
// Example usage
const authService = new AuthService();
const challenge = await authService.generateChallenge(stellarAddress);
const { token, user } = await authService.verifyChallenge(challengeXdr);
```

### WalletService
**File**: `src/services/WalletService.ts`

Manages multi-signature wallets:
- Create wallets on Soroban contracts
- Add/remove signers
- Manage wallet settings
- Track wallet state

```typescript
const walletService = new WalletService();
const wallet = await walletService.createWallet({
  name: 'My Safe',
  threshold: 2,
  signers: [...],
  recoveryAddress: '...'
});
```

### TransactionService
**File**: `src/services/TransactionService.ts`

Handles transaction proposals and execution:
- Create proposals
- Collect signatures
- Execute when threshold met
- Track transaction state

```typescript
const txService = new TransactionService();
const proposal = await txService.createProposal({
  walletId,
  to,
  amount,
  memo
});
```

### StellarService
**File**: `src/services/StellarService.ts`

Stellar blockchain interaction:
- Account lookups
- Transaction submission
- Event tracking
- Resource management

### EventIndexerService
**File**: `src/services/EventIndexerService.ts`

Indexes blockchain events:
- Listens to contract events
- Syncs wallet state
- Detects new transactions
- Maintains sync lag metrics

### AnalyticsService
**File**: `src/services/AnalyticsService.ts`

Analytics calculations:
- Transaction trends
- Signer patterns
- Performance metrics
- Custom reports

### DatabaseBackupService
**File**: `src/services/DatabaseBackupService.ts`

Automated database backups:
- Scheduled backups
- Backup retention
- Restore functionality

### ResourceMonitor
**File**: `src/services/ResourceMonitor.ts`

System resource monitoring:
- Memory usage
- CPU utilization
- Database connections
- Cache hit rates

### RPCLoadBalancer
**File**: `src/services/RPCLoadBalancer.ts`

Load balancing across RPC endpoints:
- Health checking
- Round-robin distribution
- Failover handling

### CronService
**File**: `src/services/CronService.ts`

Scheduled tasks management:
- TTL refresh jobs
- Backup scheduling
- Health checks
- Sync monitoring

---

## Controllers

### AuthController
Handles authentication endpoints:
```typescript
// POST /api/auth/challenge
async generateChallenge(req, res)

// POST /api/auth/verify
async verifyChallenge(req, res)

// POST /api/auth/refresh
async refreshToken(req, res)

// POST /api/auth/logout
async logout(req, res)
```

### WalletController
Manages wallet operations:
```typescript
// GET /api/wallets
async listWallets(req, res)

// POST /api/wallets
async createWallet(req, res)

// GET /api/wallets/:id
async getWallet(req, res)

// PUT /api/wallets/:id
async updateWallet(req, res)

// DELETE /api/wallets/:id
async deleteWallet(req, res)
```

### TransactionController
Manages transaction proposals:
```typescript
// GET /api/transactions
async listTransactions(req, res)

// POST /api/transactions
async createTransaction(req, res)

// POST /api/transactions/:id/sign
async signTransaction(req, res)

// POST /api/transactions/:id/execute
async executeTransaction(req, res)
```

### AnalyticsController
Provides analytics data:
```typescript
// GET /api/analytics/dashboard
async getDashboard(req, res)

// GET /api/analytics/charts
async getCharts(req, res)

// GET /api/analytics/export
async exportData(req, res)
```

### EventIndexerController
Manages event indexing:
```typescript
// GET /api/events
async listEvents(req, res)

// GET /api/events/sync-status
async getSyncStatus(req, res)

// POST /api/events/reindex
async triggerReindex(req, res)
```

---

## Database Schema

### Core Models

#### User
```prisma
model User {
  id              String
  email           String @unique
  password        String
  stellarAddress  String @unique
  isActive        Boolean
  createdAt       DateTime
  updatedAt       DateTime
  
  wallets         Wallet[]
  sessions        Session[]
  signatures      Signature[]
  preferences     UserPreference?
  invitations     Invitation[]
}
```

#### Wallet
```prisma
model Wallet {
  id              String
  name            String
  contractAddress String @unique
  stellarNetwork  String
  threshold       Int
  recoveryAddress String
  createdAt       DateTime
  updatedAt       DateTime
  
  transactions    Transaction[]
  signers         Signer[]
  invitations     Invitation[]
}
```

#### Transaction
```prisma
model Transaction {
  id              String
  walletId        String
  to              String
  amount          Decimal
  memo            String?
  status          String
  xdr             String?
  createdAt       DateTime
  updatedAt       DateTime
  
  wallet          Wallet
  signatures      Signature[]
  comments        Comment[]
}
```

#### Signature
```prisma
model Signature {
  id              String
  transactionId   String
  signerAddress   String
  signature       String
  timestamp       DateTime
  
  transaction     Transaction
  user            User
}
```

### Relationships
- **User → Wallets**: One-to-Many (user can own multiple wallets)
- **Wallet → Transactions**: One-to-Many (wallet contains multiple proposals)
- **Transaction → Signatures**: One-to-Many (proposal needs multiple signatures)
- **User → Sessions**: One-to-Many (user has multiple active sessions)
- **User → Preferences**: One-to-One (user has one preference set)

---

## Middleware

### Authentication Middleware (`auth.ts`)
Verifies JWT tokens on protected routes:
```typescript
export const authMiddleware = (req, res, next) => {
  // Verifies Bearer token from Authorization header
  // Adds user info to req.user
  // Returns 401 if token is invalid or missing
}
```

### Error Handler Middleware (`errorHandler.ts`)
Catches and formats errors:
```typescript
export const errorHandler = (err, req, res, next) => {
  // Logs error
  // Returns standardized error response with status code
}
```

### Rate Limiter Middleware (`rateLimiter.ts`)
Prevents API abuse:
```typescript
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  message: 'Too many requests'
})
```

### Validation Middleware (`validation.ts`)
Validates request data using Joi:
```typescript
export const validateRequest = (schema) => (req, res, next) => {
  // Validates req.body, req.params, req.query against Joi schema
}
```

---

## Development Workflow

### Running Locally

1. **Start PostgreSQL and Redis**
   ```bash
   # Using Docker Compose
   docker-compose up -d postgres redis
   
   # Or using local installations
   psql -U postgres  # PostgreSQL
   redis-cli         # Redis
   ```

2. **Start Backend Server**
   ```bash
   npm run dev
   ```

3. **Monitor Logs**
   ```bash
   # Follow logs in real-time
   npm run dev 2>&1 | tail -f
   ```

### Code Organization Tips

- **Controllers**: Keep route logic minimal, delegate to services
- **Services**: Implement business logic and external API calls
- **Middleware**: Use for cross-cutting concerns (auth, logging, etc.)
- **Utils**: Place reusable functions (formatting, validation helpers)
- **Types**: Define all request/response types in one place

### Making Code Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes and test**
   ```bash
   npm run lint
   npm run test
   npm run dev
   ```

3. **Format code**
   ```bash
   npm run format
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   ```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/services/AuthService.test.ts

# Generate coverage report
npm run test:coverage
```

### Test Structure

```
tests/
├── unit/
│   ├── services/
│   │   └── AuthService.test.ts
│   ├── controllers/
│   │   └── WalletController.test.ts
│   └── utils/
│       └── logger.test.ts
│
├── integration/
│   ├── auth.test.ts        # End-to-end auth flow
│   ├── wallet.test.ts      # Wallet operations
│   └── transaction.test.ts # Transaction flow
│
└── fixtures/
    ├── users.ts
    ├── wallets.ts
    └── transactions.ts
```

### Writing Tests

```typescript
// Example: AuthService test
describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  test('should generate valid challenge', async () => {
    const challenge = await authService.generateChallenge('GXXXXXX');
    expect(challenge).toBeDefined();
    expect(challenge).toMatch(/^AAAA/);
  });

  test('should verify valid challenge', async () => {
    const { token, user } = await authService.verifyChallenge(validXdr);
    expect(token).toBeDefined();
    expect(user.stellarAddress).toBeDefined();
  });
});
```

---

## Deployment

### Docker Deployment

1. **Build Docker Image**
   ```bash
   docker build -t stellar-multisig-backend:latest -f ./backend/Dockerfile ./backend
   ```

2. **Run Container**
   ```bash
   docker run -p 5001:5001 \
     -e DATABASE_URL=postgresql://user:pass@postgres:5432/db \
     -e REDIS_URL=redis://redis:6379 \
     -e JWT_SECRET=your-secret \
     stellar-multisig-backend:latest
   ```

### Docker Compose Deployment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Environment-Specific Deployment

**Development**
```bash
NODE_ENV=development
LOG_LEVEL=debug
ENABLE_RATE_LIMITING=false
```

**Staging**
```bash
NODE_ENV=staging
LOG_LEVEL=info
ENABLE_ANALYTICS=true
```

**Production**
```bash
NODE_ENV=production
LOG_LEVEL=warn
ENABLE_RATE_LIMITING=true
ENABLE_ANALYTICS=true
DATABASE_URL=secured-postgresql-url
REDIS_URL=secured-redis-url
```

### Scaling Considerations

1. **Database**: Use connection pooling (PgBouncer)
2. **Cache**: Use Redis cluster for high availability
3. **Load Balancer**: Use Nginx or AWS ALB in front of API instances
4. **Monitoring**: Set up Prometheus + Grafana for metrics
5. **Logging**: Centralize logs with ELK Stack

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
- Check PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in .env
- Check credentials and port

#### 2. Redis Connection Error
```
Error: Redis connection failed
```

**Solution:**
- Check Redis is running: `redis-cli ping`
- Verify REDIS_URL in .env
- Check Redis port (default 6379)

#### 3. JWT Authentication Failed
```
Error: Invalid or expired token
```

**Solution:**
- Verify JWT_SECRET in .env
- Check token expiration time
- Ensure Authorization header format: `Bearer <token>`

#### 4. Prisma Migration Error
```
Error: Migration failed
```

**Solution:**
- Check database is accessible
- Run: `npx prisma migrate resolve`
- Check migration files in `prisma/migrations/`

#### 5. Type Errors on Build
```
error TS2307: Cannot find module
```

**Solution:**
- Run: `npm install`
- Run: `npm run db:generate` (for Prisma types)
- Delete `node_modules` and reinstall

### Debug Mode

Enable verbose logging:
```bash
# Linux/Mac
DEBUG=stellar:* npm run dev

# Windows PowerShell
$env:DEBUG='stellar:*'; npm run dev
```

### Health Check Endpoints

Monitor backend health:

```bash
# Basic health
curl http://localhost:5001/api/health

# Database status
curl http://localhost:5001/api/health/db

# Redis status
curl http://localhost:5001/api/health/cache

# Blockchain status
curl http://localhost:5001/api/health/blockchain
```

### Performance Optimization

1. **Enable compression**: Already enabled in Express
2. **Database indexing**: Check schema.prisma for @db.Index()
3. **Redis caching**: Use for frequently accessed data
4. **Connection pooling**: Configure PgBouncer
5. **Monitor slow queries**: Enable query logging

### Logging & Monitoring

Check application logs:

```bash
# Tail logs (development)
npm run dev

# View error logs
tail -f logs/error.log

# View all logs
tail -f logs/combined.log
```

Set up ELK Stack for centralized logging:
- **Elasticsearch**: Data storage
- **Logstash**: Log processing
- **Kibana**: Visualization

---

## Additional Resources

- [Stellar SDK Documentation](https://developers.stellar.org/reference)
- [Soroban Smart Contracts](https://developers.stellar.org/soroban)
- [Express.js Documentation](https://expressjs.com/)
- [Prisma ORM Documentation](https://www.prisma.io/docs/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [JWT Authentication](https://jwt.io/)
- [SEP-10 Stellar Authentication](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0010.md)

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details on:
- Code style and formatting
- Testing requirements
- Pull request process
- Issue reporting

---

**Last Updated**: March 2026
**Maintainers**: Stellar Multi-Sig Safe Team
