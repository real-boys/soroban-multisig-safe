import { useState, useEffect, useCallback } from 'react';
import { TransactionProposal } from '../types/transaction';

const MOCK_TRANSACTIONS: TransactionProposal[] = [
  {
    id: 'prop-1',
    safeId: 'safe-1',
    destination: 'GBX...7A2',
    amount: '5000',
    title: 'Monthly Server Costs',
    description: 'Payment for AWS hosting for the month of October.',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    status: 'pending',
    signatures: 2,
    threshold: 3,
    creator: 'GAC...9B1',
    signedBy: ['GAC...9B1', 'GBX...7A2'],
  },
  {
    id: 'prop-2',
    safeId: 'safe-1',
    destination: 'GDF...3Z9',
    amount: '12000',
    title: 'Marketing Campaign',
    description: 'Funds for the upcoming Q4 marketing push.',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'expired',
    signatures: 1,
    threshold: 3,
    creator: 'GBX...7A2',
    signedBy: ['GBX...7A2'],
  },
  {
    id: 'prop-3',
    safeId: 'safe-2',
    destination: 'GAC...9B1',
    amount: '250',
    title: 'Reimbursement',
    description: 'Travel expenses reimbursement.',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    expiresAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    status: 'executed',
    signatures: 3,
    threshold: 3,
    creator: 'GDF...3Z9',
    signedBy: ['GDF...3Z9', 'GAC...9B1', 'GBX...7A2'],
  },
];

export type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'creator';

export const useTransactions = () => {
  const [transactions, setTransactions] = useState<TransactionProposal[]>(MOCK_TRANSACTIONS);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTransactions = useCallback(async () => {
    // TODO: Replace with actual backend call: await axios.get('/api/transactions')
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTransactions();
    const intervalId = setInterval(fetchTransactions, 10000);
    return () => clearInterval(intervalId);
  }, [fetchTransactions]);

  const getTransaction = (id: string) => transactions.find((t) => t.id === id);

  return { transactions, loading, getTransaction };
};
