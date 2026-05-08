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
