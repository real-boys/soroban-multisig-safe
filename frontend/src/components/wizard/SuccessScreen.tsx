import React, { useState } from 'react';
import { Box, Typography, Button, Paper, IconButton, InputAdornment, TextField, Snackbar } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

interface SuccessScreenProps {
  contractId: string;
  onReset: () => void;
}

const SuccessScreen: React.FC<SuccessScreenProps> = ({ contractId, onReset }) => {
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(contractId);
    setSnackbarOpen(true);
  };

  return (
    <Box textAlign="center">
      <CheckCircleOutlineIcon color="success" sx={{ fontSize: 80, mb: 2 }} />
      <Typography variant="h5" gutterBottom>
        Deployment Successful!
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Your new multi-sig safe has been created on the network.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="overline">New Contract ID</Typography>
        <TextField
          value={contractId}
          fullWidth
          InputProps={{
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={handleCopy} edge="end">
                  <ContentCopyIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <Button variant="contained" onClick={onReset}>
        Create Another Safe
      </Button>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message="Contract ID copied to clipboard!"
      />
    </Box>
  );
};

export default SuccessScreen;