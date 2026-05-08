import React from 'react';
import { Box, Typography, TextField, Tooltip, Stack } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { StrKey } from '@stellar/stellar-sdk';

interface Step3RecoveryProps {
  recoveryAddress: string;
  setRecoveryAddress: (value: string) => void;
  recoveryDelay: number;
  setRecoveryDelay: (value: number) => void;
}

const Step3Recovery: React.FC<Step3RecoveryProps> = ({
  recoveryAddress,
  setRecoveryAddress,
  recoveryDelay,
  setRecoveryDelay,
}) => {
  const isAddressValid = recoveryAddress === '' || StrKey.isValidEd25519PublicKey(recoveryAddress);

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} mb={1}>
        <Typography variant="h6" gutterBottom mb={0}>
          Configure Recovery Options
        </Typography>
        <Tooltip
          title="A time-lock adds a mandatory waiting period before a recovery action (like changing owners) can be executed. This provides a window to cancel malicious recovery attempts."
          arrow
        >
          <InfoOutlinedIcon color="action" sx={{ cursor: 'pointer' }} />
        </Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Set up an emergency recovery address and a time-lock delay. This address can reclaim control of the safe if the original signers lose access.
      </Typography>

      <TextField
        label="Recovery Address (Optional)"
        value={recoveryAddress}
        onChange={(e) => setRecoveryAddress(e.target.value)}
        fullWidth
        margin="normal"
        error={!isAddressValid}
        helperText={!isAddressValid ? 'Invalid Stellar Public Key' : ''}
      />

      <TextField
        label="Time-Lock Delay (in days)"
        type="number"
        value={recoveryDelay}
        onChange={(e) => setRecoveryDelay(Math.max(1, parseInt(e.target.value, 10) || 1))}
        fullWidth
        margin="normal"
        InputProps={{
          inputProps: { min: 1 },
        }}
        helperText="Minimum delay is 1 day."
      />
    </Box>
  );
};

export default Step3Recovery;