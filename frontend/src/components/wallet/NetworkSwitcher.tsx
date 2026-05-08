import React from 'react';
import { useWallet } from '../../hooks/useWallet';
import { Network } from '../../contexts/WalletContext';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

const NetworkSwitcher: React.FC = () => {
  const { network, setNetwork } = useWallet();

  const handleNetworkChange = (
    _event: React.MouseEvent<HTMLElement>,
    newNetwork: Network | null
  ) => {
    if (newNetwork !== null) {
      setNetwork(newNetwork);
    }
  };

  return (
    <ToggleButtonGroup
      color="primary"
      value={network}
      exclusive
      onChange={handleNetworkChange}
      aria-label="Network"
    >
      <ToggleButton value="TESTNET">Testnet</ToggleButton>
      <ToggleButton value="MAINNET">Mainnet</ToggleButton>
    </ToggleButtonGroup>
  );
};

export default NetworkSwitcher;
