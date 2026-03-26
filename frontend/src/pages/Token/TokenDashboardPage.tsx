import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  Stack,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { walletService } from '@/services/walletService';

interface TokenBalance {
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  formattedBalance: string;
  iconUrl?: string;
  isVerified: boolean;
  priceUsd?: number;
  valueUsd?: number;
  change24h?: number;
}

interface PortfolioValue {
  totalValueUsd: string;
  breakdown: Array<{
    symbol: string;
    amount: string;
    valueUsd: string;
    percentage: string;
  }>;
}

const TokenDashboardPage: React.FC = () => {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [walletAddress, setWalletAddress] = useState<string>('');

  // Fetch wallet details to get contract address
  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet', walletId],
    queryFn: () => walletService.getWallet(walletId!),
    enabled: !!walletId,
  });

  useEffect(() => {
    if (walletData?.data?.contractAddress) {
      setWalletAddress(walletData.data.contractAddress);
    }
  }, [walletData]);

  // Fetch token balances
  const { data: balancesData, isLoading: balancesLoading, refetch: refetchBalances } = useQuery({
    queryKey: ['tokenBalances', walletAddress],
    queryFn: () => walletService.getTokenBalances(walletAddress),
    enabled: !!walletAddress,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch portfolio value
  const { data: portfolioData } = useQuery({
    queryKey: ['portfolioValue', walletAddress],
    queryFn: () => walletService.getPortfolioValue(walletAddress),
    enabled: !!walletAddress,
  });

  // Handle send action
  const handleSend = (tokenSymbol: string) => {
    // Navigate to proposal wizard with token pre-selected
    navigate(`/wallets/${walletId}/transactions/create`, {
      state: { tokenSymbol },
    });
  };

  // Handle refresh
  const handleRefresh = () => {
    refetchBalances();
    toast.success('Balances refreshed');
  };

  if (walletLoading || !walletAddress) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const tokens: TokenBalance[] = balancesData?.data?.balances || [];
  const portfolio: PortfolioValue = portfolioData?.data || { totalValueUsd: '0', breakdown: [] };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Token Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {walletData?.data?.name}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={balancesLoading}
        >
          Refresh
        </Button>
      </Box>

      {/* Portfolio Summary */}
      <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <AccountBalanceWalletIcon sx={{ mr: 1, color: '#fff' }} />
            <Typography variant="h6" sx={{ color: '#fff' }}>
              Total Portfolio Value
            </Typography>
          </Box>
          <Typography variant="h3" sx={{ color: '#fff', fontWeight: 'bold', mb: 1 }}>
            ${parseFloat(portfolio.totalValueUsd).toLocaleString('en-US')}
          </Typography>
          {portfolio.breakdown.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mb: 1 }}>
                Asset Allocation:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {portfolio.breakdown.map((item) => (
                  <Chip
                    key={item.symbol}
                    label={`${item.symbol}: ${parseFloat(item.percentage).toFixed(1)}%`}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.2)',
                      color: '#fff',
                      '& .MuiChip-label': { color: '#fff' },
                    }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Warning for unrecognized assets */}
      {tokens.some(t => !t.isVerified) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          This wallet contains unrecognized or custom assets. Please verify contract addresses
          before interacting with unknown tokens.
        </Alert>
      )}

      {/* Token List */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Tokens
          </Typography>

          {balancesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : tokens.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              No tokens found in this wallet yet.
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Token</TableCell>
                    <TableCell align="right">Balance</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Value (USD)</TableCell>
                    <TableCell align="right">24h Change</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tokens.map((token) => (
                    <TableRow key={token.contractId}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {token.iconUrl ? (
                            <img
                              src={token.iconUrl}
                              alt={token.symbol}
                              style={{ width: 32, height: 32, marginRight: 8 }}
                            />
                          ) : (
                            <AccountBalanceWalletIcon sx={{ mr: 1 }} />
                          )}
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {token.symbol}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {token.name}
                            </Typography>
                            {!token.isVerified && (
                              <Chip
                                label="Unverified"
                                size="xs"
                                color="warning"
                                sx={{ ml: 1 }}
                              />
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          {parseFloat(token.formattedBalance).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">
                          ${token.priceUsd?.toFixed(2) || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="bold">
                          ${token.valueUsd?.toFixed(2) || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {token.change24h !== undefined && (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            <TrendingUpIcon
                              sx={{
                                color: token.change24h >= 0 ? '#4caf50' : '#f44336',
                                fontSize: 16,
                                mr: 0.5,
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                color: token.change24h >= 0 ? '#4caf50' : '#f44336',
                              }}
                            >
                              {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                            </Typography>
                          </Box>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<SendIcon />}
                          onClick={() => handleSend(token.symbol)}
                        >
                          Send
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default TokenDashboardPage;
