import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './contexts/WalletContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Header from './components/layout/Header';
import { Box, Container } from '@mui/material';
import TransactionList from './components/dashboard/TransactionList';
import TransactionDetails from './components/dashboard/TransactionDetails';
import CreateSafeWizard from './components/wizard/CreateSafeWizard';

const App: React.FC = () => {
  return (
    <WalletProvider>
      <NotificationProvider>
        <Header />
        <Box mt={4}>
          <Container maxWidth="lg">
            <Router>
              <Routes>
                <Route path="/" element={<TransactionList />} />
                <Route path="/create" element={<CreateSafeWizard />} />
                <Route path="/proposal/:id" element={<TransactionDetails />} />
              </Routes>
            </Router>
          </Container>
        </Box>
      </NotificationProvider>
    </WalletProvider>
  );
};

export default App;