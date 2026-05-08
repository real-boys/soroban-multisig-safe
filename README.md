# Multi-Sig Safe with Time-Lock Recovery (Stellar)

A multi-signature wallet solution built on Stellar/Soroban with time-lock recovery, featuring a full-stack application for secure digital asset management.

## Project Structure

```
soroban-multisig-safe/
├── contracts/              # Stellar smart contracts
│   └── soroban/           # Soroban Rust contracts (lib.rs, treasury.rs, etc.)
├── backend/               # Node.js/Express API server (TypeScript)
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── config/
│   │   ├── types/
│   │   └── tests/
│   └── prisma/            # Database schema and migrations
├── frontend/              # React/Vite frontend (TypeScript)
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── hooks/
│       ├── contexts/
│       └── types/
├── docs/                  # Project documentation
├── scripts/               # Deployment and utility scripts
├── nginx/                 # Nginx reverse proxy config
├── elk/                   # ELK stack config (logging)
└── .github/               # CI/CD workflows and issue templates
```

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Docker (for PostgreSQL and Redis)

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd soroban-multisig-safe

# Install all dependencies
npm run install:all

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your database, Redis, and Stellar config

# Start development environment (all services)
npm run dev
```

### Database Setup

```bash
cd backend
npx prisma migrate dev   # Run migrations
npx prisma generate      # Generate Prisma client
```

### Local Stellar Network (optional)

```bash
docker run -d --name stellar-local -p 8000:8000 stellar/quickstart:latest
```

## Available Scripts

### Root

| Command | Description |
|---|---|
| `npm run install:all` | Install dependencies for all packages |
| `npm run dev` | Start all services concurrently |
| `npm run build` | Build all packages |
| `npm run test` | Run all tests |
| `npm run lint` | Lint all packages |

### Smart Contracts

| Command | Description |
|---|---|
| `npm run contract:build` | Build WASM contracts |
| `npm run contract:test` | Run contract tests |
| `npm run contract:deploy` | Deploy to testnet |
| `npm run contract:lint` | Run clippy |

### Backend

| Command | Description |
|---|---|
| `npm run backend:dev` | Start backend in dev mode |
| `npm run backend:build` | Build for production |
| `npm run backend:test` | Run tests |

### Frontend

| Command | Description |
|---|---|
| `npm run frontend:dev` | Start frontend dev server |
| `npm run frontend:build` | Build for production |
| `npm run frontend:test` | Run tests |

## Architecture

### Smart Contracts (Rust/Soroban)

- **MultiSig**: Core multi-signature logic with configurable threshold
- **TimeLock**: Time-delayed recovery mechanisms
- **Treasury**: Treasury management with spending limits
- **Escrow, Staking, Vesting**: Additional DeFi primitives

See [docs/contracts.md](docs/contracts.md) for full contract documentation.

### Backend (Node.js/Express/TypeScript)

- RESTful API with versioning (`/api/v1`, `/api/v2`)
- PostgreSQL via Prisma ORM
- Redis for caching and rate limiting
- JWT authentication
- WebSocket support (Socket.io)
- Circuit breaker, retry logic, and exponential backoff for Stellar RPC calls
- Distributed task scheduling

### Frontend (React/TypeScript/Vite)

- Material-UI component library
- React Query for data fetching
- Freighter wallet integration
- Real-time updates via WebSocket

## Technology Stack

| Layer | Technologies |
|---|---|
| Smart Contracts | Rust, Soroban SDK, WASM |
| Backend | Node.js, Express, TypeScript, Prisma, PostgreSQL, Redis |
| Frontend | React, TypeScript, Vite, Material-UI, React Query |
| DevOps | Docker, GitHub Actions, Nginx, ELK Stack |

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing secret |
| `STELLAR_NETWORK` | `futurenet`, `testnet`, or `mainnet` |
| `STELLAR_RPC_URL` | Stellar RPC endpoint |
| `CONTRACT_ID` | Deployed contract address |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and PR process.

### Issue Templates

- [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md)
- [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md)
- [Security Issue](.github/ISSUE_TEMPLATE/security_issue.md)
- [Documentation](.github/ISSUE_TEMPLATE/documentation.md)

## Documentation

- [Contract Guide](docs/contracts.md)

## License

MIT — see [LICENSE](LICENSE).
