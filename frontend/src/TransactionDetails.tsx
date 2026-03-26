import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  LinearProgress,
  Chip,
  Divider,
  Grid,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTransactions } from '../../hooks/useTransactions';
import { useWallet } from '../../hooks/useWallet';

const TransactionDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getTransaction } = useTransactions();
  const { kit, publicKey } = useWallet();

  const transaction = getTransaction(id || '');

  if (!transaction) {
    return <Typography color="error">Transaction not found.</Typography>;
  }

  const progressPercentage = (transaction.signatures / transaction.threshold) * 100;
  const isPending = transaction.status === 'pending';

  const handleApprove = async () => {
    if (!kit || !publicKey) return alert('Please connect your wallet.');
    try {
      // Placeholder for actual Soroban transaction signing logic
      const mockXdr = 'AAAAAgAAAA...';
      await kit.signTx({ xdr: mockXdr });
      alert('Successfully signed the proposal!');
    } catch (e) {
      console.error(e);
      alert('Signature rejected.');
    }
  };

  const handleReject = async () => {
    if (!kit || !publicKey) return alert('Please connect your wallet.');
    if (window.confirm('Are you sure you want to reject/cancel this proposal?')) {
      // Placeholder for cancellation logic
      alert('Proposal cancelled.');
    }
  };

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        Back to Proposals
      </Button>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5">{transaction.title}</Typography>
            <Chip
              label={transaction.status.toUpperCase()}
              color={isPending ? 'warning' : transaction.status === 'executed' ? 'success' : 'error'}
            />
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <Typography color="text.secondary" variant="subtitle2">Destination</Typography>
              <Typography variant="body1">{transaction.destination}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography color="text.secondary" variant="subtitle2">Amount</Typography>
              <Typography variant="body1" color="primary" fontWeight="bold">{transaction.amount} XLM</Typography>
            </Grid>
          </Grid>

          <Box mb={4}>
            <Stack direction="row" justifyContent="space-between" mb={1}>
              <Typography variant="body2">Signatures Progress</Typography>
              <Typography variant="body2" fontWeight="bold">
                {transaction.signatures} / {transaction.threshold} Signed
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={progressPercentage} sx={{ height: 10, borderRadius: 5 }} />
          </Box>

          {isPending && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button variant="contained" color="success" onClick={handleApprove} fullWidth>Approve / Sign</Button>
              <Button variant="outlined" color="error" onClick={handleReject} fullWidth>Reject / Cancel</Button>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
export default TransactionDetails;