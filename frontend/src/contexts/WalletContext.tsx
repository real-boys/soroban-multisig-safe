import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  isConnected,
  getPublicKey,
  signTransaction,
  requestAccess,
} from '@stellar/freighter-api';

export type Network = 'TESTNET' | 'MAINNET';

interface WalletContextType {
  publicKey: string;
  isConnected: boolean;
  network: Network;
  setNetwork: (network: Network) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTx: (xdr: string) => Promise<string>;
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState('');
  const [connected, setConnected] = useState(false);
  const [network, setNetwork] = useState<Network>('TESTNET');

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const freighterConnected = await isConnected();
        if (freighterConnected) {
          const pk = await getPublicKey();
          setPublicKey(pk);
          setConnected(true);
        }
      } catch {
        // Freighter not installed or not accessible
      }
    })();
  }, []);

  const connect = useCallback(async () => {
    try {
      await requestAccess();
      const pk = await getPublicKey();
      setPublicKey(pk);
      setConnected(true);
    } catch (error) {
      console.error('Wallet connection failed:', error);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey('');
    setConnected(false);
  }, []);

  const signTx = useCallback(
    async (xdr: string): Promise<string> => {
      const result = await signTransaction(xdr, { network });
      return result;
    },
    [network]
  );

  return (
    <WalletContext.Provider
      value={{ publicKey, isConnected: connected, network, setNetwork, connect, disconnect, signTx }}
    >
      {children}
    </WalletContext.Provider>
  );
};
