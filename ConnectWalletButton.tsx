import React from 'react';
import { useWallet } from '../../hooks/useWallet';
import { Button, Box, Chip } from '@mui/material';

const ConnectWalletButton: React.FC = () => {
  const { publicKey, connect, disconnect, kit } = useWallet();

  const getWalletName = () => {
    if (!kit?.walletType) return 'Unknown Wallet';
    const walletName = kit.walletType.charAt(0).toUpperCase() + kit.walletType.slice(1);
    return walletName;
  };

  if (publicKey) {
    return (
      <Box display="flex" alignItems="center" gap={2}>
        <Chip
          label={`${getWalletName()}: ${publicKey.substring(0, 4)}...${publicKey.substring(
            publicKey.length - 4
          )}`}
          variant="outlined"
          onDelete={disconnect}
        />
      </Box>
    );
  }

  return (
    <Button variant="contained" color="primary" onClick={connect}>
      Connect Wallet
    </Button>
  );
};

export default ConnectWalletButton;