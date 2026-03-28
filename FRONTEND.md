# Frontend Documentation - Stellar Multi-Sig Safe

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Project Structure](#architecture--project-structure)
3. [Key Components](#key-components)
4. [Context & State Management](#context--state-management)
5. [Custom Hooks](#custom-hooks)
6. [Pages & Routes](#pages--routes)
7. [Services](#services)
8. [Type Definitions](#type-definitions)
9. [Development Setup](#development-setup)
10. [API Integration](#api-integration)
11. [Component Communication](#component-communication)
12. [Styling & Theme](#styling--theme)
13. [Real-time Features](#real-time-features)
14. [Best Practices](#best-practices)
15. [Testing](#testing)

---

## Overview

The frontend is a **React 18 + TypeScript** single-page application (SPA) built with **Vite** for fast development and optimized production builds. It provides a user-friendly interface for managing multi-signature Stellar wallets with the following capabilities:

- **Wallet Creation**: Multi-step wizard for creating multi-signature wallets
- **Transaction Management**: Submit, view, and approve transactions
- **Real-time Updates**: Live WebSocket connections for instant notifications
- **Network Management**: Switch between Stellar networks (mainnet, testnet, futurenet)
- **Analytics**: Dashboard with transaction metrics and history
- **Wallet Connectivity**: Support for Stellar wallet integrations
- **Token Management**: View and manage tokens across wallets

### Tech Stack

```json
{
  "core": ["React 18", "TypeScript", "Vite"],
  "ui": ["Material-UI (MUI 5)", "Emotion (styled components)"],
  "state": ["Zustand (global state)", "React Context"],
  "data": ["React Query (@tanstack)", "Axios"],
  "forms": ["React Hook Form", "Yup (validation)"],
  "routing": ["React Router v6"],
  "realtime": ["Socket.io client"],
  "blockchain": ["Stellar SDK"],
  "utilities": ["Date-fns", "Lodash", "UUID"],
  "animations": ["Framer Motion"],
  "charts": ["Recharts"],
  "notifications": ["React Hot Toast"],
  "testing": ["Vitest", "React Testing Library"],
  "build": ["Vite", "TypeScript compiler"]
}
```

---

## Architecture & Project Structure

### Directory Layout

```
frontend/
├── src/
│   ├── App.tsx                           # Root component with routing
│   ├── main.tsx                          # Entry point
│   ├── index.css                         # Global styles
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx               # Navigation header
│   │   │   ├── Footer.tsx               # Footer (if present)
│   │   │   └── Sidebar.tsx              # Navigation sidebar (if present)
│   │   │
│   │   ├── dashboard/
│   │   │   ├── TransactionList.tsx      # Transaction history table
│   │   │   ├── TransactionDetails.tsx   # Individual transaction details
│   │   │   ├── NotificationBell.tsx     # Notification dropdown
│   │   │   └── DashboardOverview.tsx    # Analytics/metrics overview (if present)
│   │   │
│   │   ├── wizard/
│   │   │   ├── CreateSafeWizard.tsx     # Main wizard orchestrator
│   │   │   ├── Step1Signers.tsx         # Add wallet signers
│   │   │   ├── Step2Threshold.tsx       # Set approval threshold
│   │   │   ├── Step3Recovery.tsx        # Configure recovery settings
│   │   │   ├── Step4Review.tsx          # Review & deploy
│   │   │   └── SuccessScreen.tsx        # Deployment success
│   │   │
│   │   ├── wallet/
│   │   │   ├── ConnectWalletButton.tsx  # Stellar wallet connection
│   │   │   ├── WalletSelector.tsx       # Wallet selection dropdown (if present)
│   │   │   └── NetworkSwitcher.tsx      # Network selection
│   │   │
│   │   ├── common/
│   │   │   ├── LoadingSpinner.tsx       # Reusable loading spinner
│   │   │   ├── ErrorBoundary.tsx        # Error handling
│   │   │   ├── ConfirmDialog.tsx        # Confirmation dialogs
│   │   │   └── EmptyState.tsx           # Empty state UI
│   │   │
│   │   └── forms/
│   │       ├── TransactionForm.tsx      # Submit transaction form
│   │       ├── SignatureForm.tsx        # Sign transaction form
│   │       └── ValidationHelpers.tsx    # Form validation utilities
│   │
│   ├── contexts/
│   │   ├── WalletContext.tsx            # Wallet state management (provider)
│   │   └── NotificationContext.tsx      # Notifications state management
│   │
│   ├── hooks/
│   │   ├── useWallet.ts                 # Wallet context hook
│   │   ├── useNotifications.ts          # Notification context hook
│   │   ├── useTransactions.ts           # Transaction data & logic
│   │   ├── useWebSocket.ts              # WebSocket connection management
│   │   ├── useFetch.ts                  # API fetch wrapper (if present)
│   │   └── useLocalStorage.ts           # LocalStorage persistence (if present)
│   │
│   ├── pages/
│   │   ├── Wallets/
│   │   │   ├── WalletsPage.tsx          # Wallet list & management
│   │   │   └── CreateWalletPage.tsx     # Dedicated wallet creation page
│   │   │
│   │   ├── Token/
│   │   │   └── TokenDashboardPage.tsx   # Token management dashboard
│   │   │
│   │   ├── Home/
│   │   │   └── HomePage.tsx             # Landing page (if present)
│   │   │
│   │   ├── Settings/
│   │   │   └── SettingsPage.tsx         # User settings (if present)
│   │   │
│   │   └── NotFound.tsx                 # 404 page
│   │
│   ├── services/
│   │   ├── walletService.ts             # Wallet API calls & business logic
│   │   ├── transactionService.ts        # Transaction API calls (if present)
│   │   ├── authService.ts               # Authentication API calls (if present)
│   │   ├── api.ts                       # Axios instance & base configuration
│   │   └── socketService.ts             # WebSocket client setup (if present)
│   │
│   ├── types/
│   │   ├── transaction.ts               # TransactionProposal, TransactionStatus types
│   │   ├── wallet.ts                    # Wallet, WalletOwner types (if present)
│   │   ├── notification.ts              # AppNotification type (if present)
│   │   ├── api.ts                       # API response types (if present)
│   │   └── index.ts                     # Type exports
│   │
│   ├── store/
│   │   ├── walletStore.ts               # Zustand wallet store (if using Zustand)
│   │   └── uiStore.ts                   # Zustand UI state (if using Zustand)
│   │
│   ├── utils/
│   │   ├── formatters.ts                # Format dates, amounts, addresses
│   │   ├── validators.ts                # Input validation helpers
│   │   ├── constants.ts                 # App-wide constants
│   │   ├── axios.ts                     # Axios setup & interceptors
│   │   └── helpers.ts                   # General utility functions
│   │
│   ├── styles/
│   │   ├── theme.ts                     # MUI theme configuration
│   │   ├── globals.css                  # Global CSS variables
│   │   └── components.css               # Component-specific styles
│   │
│   └── assets/
│       ├── images/
│       ├── icons/
│       └── fonts/
│
├── public/
│   ├── index.html                       # Entry HTML file
│   ├── favicon.ico
│   └── manifest.json
│
├── tests/
│   ├── unit/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── services/
│   │
│   ├── integration/
│   │   ├── wallet.test.tsx
│   │   ├── transactions.test.tsx
│   │   └── auth.test.tsx
│   │
│   ├── e2e/
│   │   └── wallet-flow.test.ts
│   │
│   └── setup.ts                         # Vitest configuration
│
├── .env.example                         # Environment variables template
├── .eslintrc.js                         # ESLint configuration
├── .prettierrc                          # Prettier configuration
├── tsconfig.json                        # TypeScript configuration
├── vite.config.ts                       # Vite configuration
├── vitest.config.ts                     # Vitest configuration
├── package.json                         # Dependencies
├── Dockerfile                           # Docker image configuration
└── README.md                            # Frontend-specific README

```

---

## Key Components

### Layout Components

#### Header.tsx
**Purpose**: Main navigation header
**Features**:
- Logo and branding
- Navigation menu
- User profile dropdown
- Network selector
- Notification bell

**Usage**:
```tsx
<Header />
```

---

### Page/Screen Components

#### CreateSafeWizard.tsx
**Purpose**: Multi-step wizard for creating multi-signature wallets
**Props**: None (uses hooks for state)
**State Management**:
- `activeStep`: Current wizard step (0-4)
- `signers`: Array of wallet signers
- `threshold`: Required approval count
- `recoveryAddress`: Recovery wallet address
- `recoveryDelay`: Recovery delay in days
- `newContractId`: Deployed contract ID

**Steps**:
1. **Step1Signers**: Add wallet signers
2. **Step2Threshold**: Set approval threshold
3. **Step3Recovery**: Configure recovery mechanism
4. **Step4Review**: Review and deploy
5. **SuccessScreen**: Deployment confirmation

**Features**:
- Pre-fills user's public key as first signer
- Form validation at each step
- Contract deployment via Stellar Service
- Local state management (consider migrating to Zustand)

**Example**:
```tsx
<CreateSafeWizard />
```

---

#### TransactionList.tsx
**Purpose**: Display all transactions in a sortable, filterable table
**Features**:
- Real-time transaction updates via polling/WebSocket
- Sorting (by date, amount, creator)
- Filtering by status (pending, executed, expired)
- Pagination/virtualization for large lists
- Transaction detail navigation

**Hooks Used**: `useTransactions()`, `useNotifications()`

**Example**:
```tsx
const { transactions, loading, error } = useTransactions();
```

---

#### TransactionDetails.tsx
**Purpose**: Display detailed view of a single transaction
**Features**:
- Transaction metadata (title, description, amount)
- Signatures display
- Approval/rejection actions
- Timeline of actions
- Download transaction details

**Routing**: `/proposal/:id`

---

#### NotificationBell.tsx
**Purpose**: Notification dropdown in header
**Features**:
- Badge showing unread count
- Dropdown with notification list
- Safe filter (show all or filter by wallet)
- Mark as read functionality
- Different notification types (info, warning, critical)

**Context**: Uses `NotificationContext` for state

---

### Wizard Step Components

#### Step1Signers.tsx
**Props**:
```tsx
interface Step1Props {
  signers: Signer[];
  onSignersChange: (signers: Signer[]) => void;
}

interface Signer {
  name: string;
  publicKey: string;
}
```
**Features**:
- Add/remove signers
- Validate public key format
- Duplicate signer check
- Minimum 2 signers requirement

---

#### Step2Threshold.tsx
**Props**:
```tsx
interface Step2Props {
  signers: Signer[];
  threshold: number;
  onThresholdChange: (threshold: number) => void;
}
```
**Features**:
- Slider/input for threshold selection
- Validation: `1 <= threshold <= signers.length`
- Visual representation of M-of-N (2-of-3, 3-of-5, etc.)

---

#### Step3Recovery.tsx
**Props**:
```tsx
interface Step3Props {
  recoveryAddress: string;
  recoveryDelay: number;
  onRecoveryAddressChange: (address: string) => void;
  onRecoveryDelayChange: (delay: number) => void;
}
```
**Features**:
- Input for recovery wallet address
- Slider for recovery delay (in days)
- Validation: positive values, valid Stellar address
- Description: time-lock mechanism explanation

---

#### Step4Review.tsx
**Props**:
```tsx
interface Step4Props {
  signers: Signer[];
  threshold: number;
  recoveryAddress: string;
  recoveryDelay: number;
  onDeploy: () => Promise<void>;
  isDeploying: boolean;
}
```
**Features**:
- Summary of all configured settings
- Deploy button
- Loading state during deployment
- Error handling

---

#### SuccessScreen.tsx
**Props**:
```tsx
interface SuccessScreenProps {
  contractId: string;
  onContinue: () => void;
}
```
**Features**:
- Displays deployed contract ID
- Copy-to-clipboard button
- Link to view contract on block explorer
- Action buttons (view wallet, go to dashboard)

---

### Wallet Components

#### ConnectWalletButton.tsx
**Purpose**: Connect/disconnect Stellar wallet (e.g., Freighter, Albedo)
**Features**:
- Show connection status
- Display connected address (truncated)
- Connect/disconnect actions
- Network display

**Integration**: Uses `WalletContext` for state

---

#### NetworkSwitcher.tsx
**Purpose**: Switch between Stellar networks
**Features**:
- Dropdown to select network (mainnet, testnet, futurenet)
- Current network indicator
- Network-specific RPC configuration
- Validation on network change

---

### Common Components

#### LoadingSpinner.tsx
```tsx
<LoadingSpinner variant="circular" size="large" />
```

#### ErrorBoundary.tsx
Catches React component errors and displays fallback UI

#### ConfirmDialog.tsx
```tsx
<ConfirmDialog 
  open={open}
  title="Confirm Action"
  message="Are you sure?"
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>
```

---

## Context & State Management

### 1. WalletContext.tsx

**Purpose**: Manages wallet connection state, network, and user identity

**Context Shape**:
```tsx
interface WalletContextType {
  publicKey: string | null;
  isConnected: boolean;
  network: 'mainnet' | 'testnet' | 'futurenet';
  balance: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: string) => Promise<void>;
}

const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Implementation
};
```

**Features**:
- Persists wallet connection state in localStorage
- Manages network switching
- Handles wallet connection lifecycle
- Provides wallet address to child components

**Usage**:
```tsx
const { publicKey, isConnected, network, connect } = useWallet();
```

---

### 2. NotificationContext.tsx

**Purpose**: Manages application notifications (alerts, warnings, critical messages)

**Context Shape**:
```tsx
export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  read: boolean;
  safeId: string;
  createdAt: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAllAsRead: () => void;
  markAsRead: (id: string) => void;
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt'>) => void;
  removeNotification: (id: string) => void;
}

const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Implementation
};
```

**Features**:
- Socket.io integration for real-time notifications
- Browser Notification API support
- Polling fallback for notification fetching
- Notification filtering by wallet/safe
- Mark as read tracking

**Usage**:
```tsx
const { notifications, unreadCount, markAsRead } = useNotifications();
```

---

### State Management Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      React Router                        │
├─────────────────────────────────────────────────────────┤
│  App.tsx                                                 │
│  ├── WalletProvider                                      │
│  │   ├── NotificationProvider                            │
│  │   │   ├── Header (uses WalletContext, Notifications) │
│  │   │   ├── Routes                                      │
│  │   │   │   ├── Home                                    │
│  │   │   │   ├── Wallets                                 │
│  │   │   │   ├── Create Safe Wizard                      │
│  │   │   │   └── Transaction Details                     │
│  │   │   └── [Component Tree]                            │
│  │   └── NotificationProvider                            │
│  └── WalletProvider                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Custom Hooks

### useWallet.ts
**Purpose**: Access wallet context in components

```tsx
export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
};

// Usage
const { publicKey, isConnected, connect, disconnect } = useWallet();
```

---

### useNotifications.ts
**Purpose**: Access notification context

```tsx
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

// Usage
const { notifications, unreadCount, markAsRead } = useNotifications();
```

---

### useTransactions.ts
**Purpose**: Fetch, filter, and sort transactions

```tsx
export const useTransactions = () => {
  const [transactions, setTransactions] = useState<TransactionProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');

  const fetchTransactions = useCallback(async () => {
    // API call to fetch transactions
  }, []);

  useEffect(() => {
    fetchTransactions();
    // Setup polling/WebSocket for real-time updates
  }, []);

  return { transactions, loading, sortBy, setSortBy };
};

// Usage
const { transactions, loading } = useTransactions();
```

**Features**:
- Real-time polling for transaction updates
- WebSocket integration for live updates
- Sorting options (date, amount, creator)
- Filtering by status
- Mock data fallback

---

### useWebSocket.ts (if implemented)
**Purpose**: Manage WebSocket connections

```tsx
export const useWebSocket = (url: string, onMessage: (data: any) => void) => {
  useEffect(() => {
    const socket = io(url);
    socket.on('message', onMessage);
    return () => socket.disconnect();
  }, [url, onMessage]);
};
```

---

## Pages & Routes

### Route Structure

```
GET  /                              TransactionList (Dashboard)
GET  /create                        CreateSafeWizard
GET  /proposal/:id                  TransactionDetails
GET  /wallets                        WalletsPage
GET  /wallets/create                CreateWalletPage
GET  /tokens                         TokenDashboardPage
GET  /settings                       SettingsPage (if present)
GET  *                              NotFound (404)
```

### App.tsx Routing
```tsx
<Routes>
  <Route path="/" element={<TransactionList />} />
  <Route path="/create" element={<CreateSafeWizard />} />
  <Route path="/proposal/:id" element={<TransactionDetails />} />
</Routes>
```

---

## Services

### walletService.ts
**Purpose**: Handle wallet-related API calls and business logic

```tsx
export const walletService = {
  // Get all wallets for current user
  getWallets: async () => { /* ... */ },

  // Get single wallet by ID
  getWallet: async (id: string) => { /* ... */ },

  // Create new multi-sig wallet
  createWallet: async (params: CreateWalletParams) => { /* ... */ },

  // Get wallet owners
  getOwners: async (walletId: string) => { /* ... */ },

  // Get wallet transactions
  getTransactions: async (walletId: string) => { /* ... */ },

  // Update wallet settings
  updateWallet: async (id: string, updates: Partial<Wallet>) => { /* ... */ },

  // Delete wallet
  deleteWallet: async (id: string) => { /* ... */ },
};
```

**Integration**: Called from components and hooks

---

### API Service (axios instance)
**Purpose**: Configure Axios with interceptors, base URL, headers

```tsx
// utils/axios.ts
export const apiClient = axios.create({
  baseURL: process.env.VITE_API_URL || 'http://localhost:5001/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
    }
    return Promise.reject(error);
  }
);
```

---

## Type Definitions

### transaction.ts
```tsx
export type TransactionStatus = 'pending' | 'executed' | 'expired';

export interface TransactionProposal {
  id: string;
  safeId: string;
  destination: string;
  amount: string;
  title: string;
  description: string;
  createdAt: string;
  expiresAt: string;
  status: TransactionStatus;
  signatures: number;
  threshold: number;
  creator: string;
  signedBy: string[];
}

export interface Signer {
  name: string;
  publicKey: string;
}
```

### notification.ts
```tsx
export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  read: boolean;
  safeId: string;
  createdAt: string;
}
```

---

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Stellar wallet (Freighter, Albedo, etc.)

### Installation

```bash
cd frontend
npm install
```

### Development Server

```bash
npm run dev
```

Starts Vite dev server at http://localhost:5173 (or next available port)

### Build for Production

```bash
npm run build
```

Outputs optimized build to `dist/` directory

### Preview Production Build

```bash
npm run preview
```

### Run Tests

```bash
npm run test                # Run tests once
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
npm run test:ui            # Vitest UI
```

### Linting & Formatting

```bash
npm run lint               # Check for issues
npm run lint:fix           # Fix issues automatically
npm run format             # Format code with Prettier
npm run type-check         # Check TypeScript types
```

### Environment Variables

Create `.env.local` file:

```env
# API Configuration
VITE_API_URL=http://localhost:5001/api
VITE_STELLAR_NETWORK=testnet

# WebSocket Configuration
VITE_SOCKET_URL=http://localhost:5001

# Stellar Configuration
VITE_STELLAR_RPC_URL=https://rpc.futurenet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE='Test SDF Network ; September 2015'

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_NOTIFICATIONS=true
```

---

## API Integration

### Base Configuration

All API requests go through the `apiClient` (Axios instance) configured in `utils/axios.ts`

### Example: Fetch Wallets

```tsx
import { apiClient } from '@/utils/axios';

export const fetchWallets = async () => {
  const response = await apiClient.get('/wallets');
  return response.data;
};
```

### Error Handling

```tsx
try {
  const data = await apiClient.get('/wallets');
} catch (error) {
  if (axios.isAxiosError(error)) {
    console.error(error.response?.data.message);
  }
}
```

### WebSocket Integration

```tsx
import io from 'socket.io-client';

const socket = io(process.env.VITE_SOCKET_URL);

socket.on('transaction:created', (transaction) => {
  console.log('New transaction:', transaction);
});

socket.on('transaction:signed', (data) => {
  console.log('Transaction signed:', data);
});

socket.on('notification:alert', (notification) => {
  console.log('Alert:', notification);
});
```

---

## Component Communication

### Parent → Child (Props)
```tsx
<Step1Signers 
  signers={signers} 
  onSignersChange={setSigners} 
/>
```

### Child → Parent (Callbacks)
```tsx
const handleSignersChange = (newSigners: Signer[]) => {
  setSigners(newSigners);
};
```

### Sibling/Global (Context)
```tsx
const { notifications } = useNotifications();
```

### Complex Flow (Custom Hooks)
```tsx
const { transactions, loading, sortBy } = useTransactions();
```

### State Management Hierarchy

```
App
├── WalletContext (manages wallet connection, network)
├── NotificationContext (manages notifications)
└── Components
    ├── useWallet() → WalletContext
    ├── useNotifications() → NotificationContext
    ├── useTransactions() → API + internal state
    └── localStorage/sessionStorage for persistence
```

---

## Styling & Theme

### Material-UI (MUI) Theme

**Location**: `src/styles/theme.ts` (or configured in `vite.config.ts`)

```tsx
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2', // Stellar blue
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});
```

### Global Styles

```css
/* index.css */
:root {
  --primary-color: #1976d2;
  --secondary-color: #dc004e;
  --background-color: #fafafa;
  --text-primary: rgba(0, 0, 0, 0.87);
  --text-secondary: rgba(0, 0, 0, 0.54);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background-color: var(--background-color);
  color: var(--text-primary);
  font-family: 'Roboto', sans-serif;
}
```

### Component Styles

Use MUI's `sx` prop for inline styling or `styled` API:

```tsx
import { styled } from '@mui/material/styles';
import { Box } from '@mui/material';

const StyledContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
}));
```

---

## Real-time Features

### WebSocket Integration (Socket.io)

**Setup** in `services/socketService.ts`:

```tsx
import io from 'socket.io-client';

export const socket = io(process.env.VITE_SOCKET_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

**Usage in Components**:

```tsx
useEffect(() => {
  socket.on('transaction:updated', (transaction) => {
    setTransactions(prev => 
      prev.map(t => t.id === transaction.id ? transaction : t)
    );
  });

  return () => socket.off('transaction:updated');
}, []);
```

### Real-time Event Types

- `transaction:created` - New transaction submitted
- `transaction:signed` - Transaction signed by owner
- `transaction:executed` - Transaction executed
- `notification:alert` - New alert/notification
- `wallet:updated` - Wallet configuration changed
- `recovery:initiated` - Recovery process started

---

## Best Practices

### 1. Component Organization
- Keep components focused on single responsibility
- Use composition over inheritance
- Extract reusable logic into custom hooks

### 2. State Management
- Use Context for global state (wallet, notifications)
- Use hooks for component-local state
- Avoid prop drilling; use custom hooks instead
- Consider Zustand for complex global state

### 3. Error Handling
- Always wrap API calls in try-catch
- Show user-friendly error messages
- Log errors to console in development
- Send errors to monitoring service in production

### 4. Performance
- Memoize expensive computations (`useMemo`)
- Use `React.memo` for expensive renders
- Lazy load pages/components with `React.lazy`
- Virtualize long lists (react-window)
- Debounce search/filter inputs

### 5. Accessibility
- Use semantic HTML elements
- Add ARIA labels where needed
- Ensure keyboard navigation
- Test with screen readers

### 6. Type Safety
- Always define interfaces for data types
- Avoid `any` type
- Use strict TypeScript settings
- Validate API responses

### 7. Code Quality
- Follow ESLint rules
- Format with Prettier
- Write unit tests for utils/hooks
- Write integration tests for user flows
- Keep components small and testable

### 8. Security
- Store sensitive data in localStorage only if necessary
- Use HttpOnly cookies for tokens (if available)
- Validate all user inputs
- Sanitize data before display
- Use Content Security Policy headers

---

## Testing

### Testing Strategy

```
Unit Tests
├── Components (snapshot + interaction tests)
├── Hooks (behavior tests)
└── Utils (function tests)

Integration Tests
├── Wallet creation flow
├── Transaction signing flow
└── Authentication flow

E2E Tests
├── Complete workflow scenarios
├── User journeys
└── Edge cases
```

### Example Unit Test

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell } from '@/components/dashboard/NotificationBell';

describe('NotificationBell', () => {
  it('displays unread count badge', () => {
    render(<NotificationBell />);
    expect(screen.getByText('3')).toBeInTheDocument(); // 3 unread
  });

  it('opens popover on click', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    
    await user.click(screen.getByLabelText(/notifications/i));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

### Example Hook Test

```tsx
import { renderHook, act } from '@testing-library/react';
import { useTransactions } from '@/hooks/useTransactions';

describe('useTransactions', () => {
  it('fetches transactions on mount', async () => {
    const { result } = renderHook(() => useTransactions());
    
    expect(result.current.loading).toBe(true);
    
    await act(async () => {
      // Wait for async operations
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.transactions.length).toBeGreaterThan(0);
  });
});
```

---

## Docker Configuration

### Dockerfile

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json turbo.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/frontend/dist ./dist
COPY --from=builder /app/frontend/package*.json ./
RUN npm install --production

EXPOSE 3000
CMD ["npm", "start"]
```

### Build & Run

```bash
docker build -t stellar-multisig-frontend .
docker run -p 3000:3000 stellar-multisig-frontend
```

---

## Deployment

### Build Artifacts
- Production build outputs to `dist/` directory
- Static files ready for CDN/web server
- No server-side rendering required

### Hosting Options
- Vercel (recommended for Vite apps)
- Netlify
- AWS S3 + CloudFront
- GitHub Pages
- Docker container

### Environment Configuration for Deployment

```bash
# Production build
npm run build

# Set environment variables in deployment platform
VITE_API_URL=https://api.example.com
VITE_SOCKET_URL=https://api.example.com

# Deploy dist/ folder
```

---

## Common Issues & Solutions

### Issue: WebSocket connection fails
**Solution**: Check VITE_SOCKET_URL, ensure backend is running, verify CORS settings

### Issue: Wallet connection times out
**Solution**: Ensure wallet extension is installed, check Stellar network, try different wallet provider

### Issue: Transaction signing fails
**Solution**: Verify user is wallet owner, check threshold requirements, ensure sufficient balance

### Issue: Build size too large
**Solution**: Use lazy loading for routes, code split large libraries, analyze bundle with `npm run analyze`

---

## Performance Metrics

### Lighthouse Targets
- Performance: > 90
- Accessibility: > 90
- Best Practices: > 90
- SEO: > 90

### Core Web Vitals
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1

---

## Future Enhancements

- [ ] Dark mode support
- [ ] Offline functionality (service workers)
- [ ] Progressive Web App (PWA) features
- [ ] Advanced analytics dashboard
- [ ] Multi-language support (i18n)
- [ ] Voice notifications
- [ ] Mobile app (React Native)
- [ ] Hardware wallet support (Ledger)
- [ ] QR code scanning for transaction signing
- [ ] Biometric authentication

---

## Resources

- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Material-UI Documentation](https://mui.com/material-ui/getting-started)
- [Vite Documentation](https://vitejs.dev)
- [Stellar SDK Documentation](https://developers.stellar.org/docs)
- [Socket.io Documentation](https://socket.io/docs)
- [React Router Documentation](https://reactrouter.com)

---

## Contributing

Please refer to [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on:
- Code style
- Commit messages
- Pull request process
- Testing requirements

---

## License

This project is licensed under the MIT License - see [LICENSE](../LICENSE) file for details.
