import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
} from '@mui/material';
import { useTransactions, SortOption } from '../../hooks/useTransactions';
import { TransactionStatus } from '../../types/transaction';

const TransactionList: React.FC = () => {
  const navigate = useNavigate();
  const { transactions } = useTransactions();
  const [tabFilter, setTabFilter] = useState<TransactionStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');

  const statusColors: Record<TransactionStatus, 'warning' | 'success' | 'error'> = {
    pending: 'warning',
    executed: 'success',
    expired: 'error',
  };

  const filteredAndSortedTransactions = useMemo(() => {
    let filtered = transactions;
    if (tabFilter !== 'all') {
      filtered = transactions.filter((t) => t.status === tabFilter);
    }

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'date-asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'amount-desc':
          return Number(b.amount) - Number(a.amount);
        case 'amount-asc':
          return Number(a.amount) - Number(b.amount);
        case 'creator':
          return a.creator.localeCompare(b.creator);
        default:
          return 0;
      }
    });
  }, [transactions, tabFilter, sortBy]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Proposals
      </Typography>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={2}
        mb={3}
      >
        <Tabs
          value={tabFilter}
          onChange={(_, newValue) => setTabFilter(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="All" value="all" />
          <Tab label="Active" value="pending" />
          <Tab label="Executed" value="executed" />
          <Tab label="Expired" value="expired" />
        </Tabs>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Sort By</InputLabel>
          <Select
            value={sortBy}
            label="Sort By"
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <MenuItem value="date-desc">Newest First</MenuItem>
            <MenuItem value="date-asc">Oldest First</MenuItem>
            <MenuItem value="amount-desc">Amount (High to Low)</MenuItem>
            <MenuItem value="amount-asc">Amount (Low to High)</MenuItem>
            <MenuItem value="creator">Creator</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Grid container spacing={2}>
        {filteredAndSortedTransactions.map((tx) => (
          <Grid item xs={12} key={tx.id}>
            <Card
              sx={{ cursor: 'pointer', transition: '0.2s', '&:hover': { boxShadow: 4 } }}
              onClick={() => navigate(`/proposal/${tx.id}`)}
            >
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography variant="h6">{tx.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      To: {tx.destination}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Creator: {tx.creator} | Date: {new Date(tx.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }} spacing={1}>
                    <Typography variant="h6" color="primary">
                      {tx.amount} XLM
                    </Typography>
                    <Chip
                      label={tx.status.toUpperCase()}
                      color={statusColors[tx.status]}
                      size="small"
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};
export default TransactionList;