import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Types
export interface Wallet {
  id: string;
  name: string;
  contractAddress: string;
  stellarNetwork: string;
  threshold: number;
  recoveryAddress: string;
  recoveryDelay: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owners: WalletOwner[];
  transactions: Transaction[];
  balance?: number;
  contractState?: any;
}

export interface WalletOwner {
  id: string;
  walletId: string;
  address: string;
  addedAt: string;
}

export interface Transaction {
  id: string;
  walletId: string;
  transactionId: string;
  destination: string;
  amount: string;
  data?: string;
  executed: boolean;
  signatures: number;
  createdAt: string;
  expiresAt: string;
  executedAt?: string;
  signatures: Signature[];
}

export interface Signature {
  id: string;
  transactionId: string;
  userId: string;
  signerAddress: string;
  signedAt: string;
}

export interface CreateWalletRequest {
  name: string;
  owners: string[];
  threshold: number;
  recoveryAddress: string;
  recoveryDelay: number;
}

export interface UpdateWalletRequest {
  name?: string;
}

export interface WalletsResponse {
  wallets: Wallet[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  totalPages: number;
}

// Wallet Service
export const walletService = {
  /**
   * Create a new wallet
   */
  async createWallet(walletData: CreateWalletRequest): Promise<Wallet> {
    const response = await api.post('/wallets', walletData);
    return response.data.data;
  },

  /**
   * Get user's wallets
   */
  async getWallets(page: number = 1, limit: number = 10): Promise<WalletsResponse> {
    const response = await api.get(`/wallets?page=${page}&limit=${limit}`);
    return response.data.data;
  },

  /**
   * Get specific wallet
   */
  async getWallet(walletId: string): Promise<Wallet> {
    const response = await api.get(`/wallets/${walletId}`);
    return response.data.data;
  },

  /**
   * Update wallet
   */
  async updateWallet(walletId: string, updateData: UpdateWalletRequest): Promise<Wallet> {
    const response = await api.put(`/wallets/${walletId}`, updateData);
    return response.data.data;
  },

  /**
   * Add owner to wallet
   */
  async addOwner(walletId: string, ownerAddress: string): Promise<void> {
    await api.post(`/wallets/${walletId}/owners`, { ownerAddress });
  },

  /**
   * Remove owner from wallet
   */
  async removeOwner(walletId: string, ownerAddress: string): Promise<void> {
    await api.delete(`/wallets/${walletId}/owners/${ownerAddress}`);
  },

  /**
   * Update threshold
   */
  async updateThreshold(walletId: string, threshold: number): Promise<void> {
    await api.put(`/wallets/${walletId}/threshold`, { threshold });
  },

  /**
   * Update recovery settings
   */
  async updateRecoverySettings(
    walletId: string,
    recoveryAddress: string,
    recoveryDelay: number
  ): Promise<void> {
    await api.put(`/wallets/${walletId}/recovery`, {
      recoveryAddress,
      recoveryDelay,
    });
  },

  /**
   * Get wallet balance
   */
  async getBalance(walletId: string): Promise<{ balance: number }> {
    const response = await api.get(`/wallets/${walletId}/balance`);
    return response.data.data;
  },

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    walletId: string,
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<TransactionsResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (status) {
      params.append('status', status);
    }

    const response = await api.get(`/wallets/${walletId}/transactions?${params}`);
    return response.data.data;
  },

  /**
   * Export wallet data
   */
  async exportWalletData(walletId: string, format: string = 'json'): Promise<Blob> {
    const response = await api.get(`/wallets/${walletId}/export?format=${format}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Import wallet data
   */
  async importWalletData(walletData: any, format: string): Promise<Wallet> {
    const response = await api.post('/wallets/import', { walletData, format });
    return response.data.data;
  },
};

// Transaction Service
export const transactionService = {
  /**
   * Submit a transaction
   */
  async submitTransaction(
    walletId: string,
    destination: string,
    amount: string,
    data?: string,
    expiresAt?: string
  ): Promise<Transaction> {
    const response = await api.post('/transactions', {
      walletId,
      destination,
      amount,
      data,
      expiresAt,
    });
    return response.data.data;
  },

  /**
   * Sign a transaction
   */
  async signTransaction(transactionId: string): Promise<Transaction> {
    const response = await api.post(`/transactions/${transactionId}/sign`);
    return response.data.data;
  },

  /**
   * Execute a transaction
   */
  async executeTransaction(transactionId: string): Promise<Transaction> {
    const response = await api.post(`/transactions/${transactionId}/execute`);
    return response.data.data;
  },

  /**
   * Get transaction details
   */
  async getTransaction(transactionId: string): Promise<Transaction> {
    const response = await api.get(`/transactions/${transactionId}`);
    return response.data.data;
  },

  /**
   * Get all transactions
   */
  async getTransactions(
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<TransactionsResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (status) {
      params.append('status', status);
    }

    const response = await api.get(`/transactions?${params}`);
    return response.data.data;
  },
};

// Recovery Service
export const recoveryService = {
  /**
   * Initiate recovery
   */
  async initiateRecovery(walletId: string, newRecoveryAddress: string): Promise<void> {
    await api.post('/recovery/initiate', {
      walletId,
      newRecoveryAddress,
    });
  },

  /**
   * Execute recovery
   */
  async executeRecovery(walletId: string): Promise<void> {
    await api.post('/recovery/execute', { walletId });
  },

  /**
   * Cancel recovery
   */
  async cancelRecovery(walletId: string): Promise<void> {
    await api.post('/recovery/cancel', { walletId });
  },

  /**
   * Get recovery status
   */
  async getRecoveryStatus(walletId: string): Promise<any> {
    const response = await api.get(`/recovery/status/${walletId}`);
    return response.data.data;
  },
};

// Auth Service
export const authService = {
  /**
   * Login
   */
  async login(email: string, password: string): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
  }> {
    const response = await api.post('/auth/login', { email, password });
    return response.data.data;
  },

  /**
   * Register
   */
  async register(userData: {
    email: string;
    password: string;
    stellarAddress: string;
  }): Promise<{
    user: any;
    accessToken: string;
    refreshToken: string;
  }> {
    const response = await api.post('/auth/register', userData);
    return response.data.data;
  },

  /**
   * Refresh token
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const response = await api.post('/auth/refresh', { refreshToken });
    return response.data.data;
  },

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<any> {
    const response = await api.get('/auth/me');
    return response.data.data;
  },

  /**
   * Get token balances for a wallet
   */
  async getTokenBalances(walletAddress: string): Promise<any> {
    const response = await api.get(`/token/balances/${walletAddress}`);
    return response.data;
  },

  /**
   * Get portfolio value
   */
  async getPortfolioValue(walletAddress: string): Promise<any> {
    const response = await api.get(`/token/portfolio/${walletAddress}`);
    return response.data;
  },

  /**
   * Discover custom tokens
   */
  async discoverCustomTokens(walletAddress: string): Promise<any> {
    const response = await api.get(`/token/discover/${walletAddress}`);
    return response.data;
  },

  /**
   * Get transaction history for tokens
   */
  async getTokenTransactionHistory(
    walletAddress: string,
    page?: number,
    limit?: number,
    type?: string
  ): Promise<any> {
    const params = new URLSearchParams();
    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());
    if (type) params.append('type', type);
    
    const response = await api.get(`/token/transactions/${walletAddress}?${params.toString()}`);
    return response.data;
  },
};

export default api;
