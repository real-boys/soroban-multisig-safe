import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { StellarWalletsKit, WalletType, Network } from '@stellar/wallet-kit';

interface WalletContextType {
  publicKey: string;
  kit: StellarWalletsKit | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  network: Network;
  setNetwork: (network: Network) => void;
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [publicKey, setPublicKey] = useState('');
  const [network, setNetwork] = useState<Network>(Network.TESTNET);
  const [kit, setKit] = useState<StellarWalletsKit | null>(null);

  useEffect(() => {
    const newKit = new StellarWalletsKit({
      network: network,
      selectedWallet: localStorage.getItem('selectedWallet') as WalletType | undefined,
    });
    setKit(newKit);
  }, [network]);

  // Persistent session management: check for a public key on kit initialization
  useEffect(() => {
    if (kit?.publicKey) {
      setPublicKey(kit.publicKey);
      localStorage.setItem('selectedWallet', kit.walletType as string);
    }
  }, [kit]);

  const connect = useCallback(async () => {
    if (!kit) return;
    try {
      await kit.openModal({
        onWalletSelected: async (option) => {
          kit.setWallet(option.type);
          const pk = await kit.getPublicKey();
          setPublicKey(pk);
          localStorage.setItem('selectedWallet', option.type);
        },
      });
    } catch (error) {
      console.error('Wallet connection failed:', error);
    }
  }, [kit]);

  const disconnect = useCallback(async () => {
    if (!kit) return;
    await kit.signOut();
    setPublicKey('');
    localStorage.removeItem('selectedWallet');
  }, [kit]);

  const value = {
    publicKey,
    kit,
    connect,
    disconnect,
    network,
    setNetwork,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};