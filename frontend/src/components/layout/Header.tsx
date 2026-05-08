import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import ConnectWalletButton from '../wallet/ConnectWalletButton';
import NetworkSwitcher from '../wallet/NetworkSwitcher';
import NotificationBell from '../notifications/NotificationBell';

const Header: React.FC = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Stellar Multi-Sig Safe
        </Typography>
        <Box display="flex" alignItems="center" gap={3}>
          <NotificationBell />
          <NetworkSwitcher />
          <ConnectWalletButton />
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
