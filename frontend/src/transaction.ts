export type TransactionStatus = 'pending' | 'executed' | 'expired';

export interface TransactionProposal {
  id: string;
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
}