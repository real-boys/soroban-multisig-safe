import React from 'react';
import { Box, Typography, List, ListItem, ListItemText, Divider, Paper } from '@mui/material';
import { Signer } from './CreateSafeWizard';

interface Step4ReviewProps {
  signers: Signer[];
  threshold: number;
  recoveryAddress: string;
  recoveryDelay: number;
}

const Step4Review: React.FC<Step4ReviewProps> = ({
  signers,
  threshold,
  recoveryAddress,
  recoveryDelay,
}) => {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Review and Deploy
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Please review the details of your new safe. If everything is correct, click "Deploy" to create the contract on the blockchain.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">
          Signers ({signers.length})
        </Typography>
        <List dense>
          {signers.map((signer) => (
            <ListItem key={signer.publicKey} disableGutters>
              <ListItemText primary={signer.name} secondary={signer.publicKey} />
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="overline" color="text.secondary">
          Signature Threshold
        </Typography>
        <Typography>
          {threshold} out of {signers.length}
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Typography variant="overline" color="text.secondary">
          Recovery Options
        </Typography>
        <Typography>
          Recovery Address: {recoveryAddress || 'Not set'}
        </Typography>
        <Typography>Time-Lock Delay: {recoveryDelay} days</Typography>

        <Divider sx={{ my: 2 }} />

        <Typography variant="overline" color="text.secondary">
          Network & Gas
        </Typography>
        <Typography>
          This will be a transaction on the Stellar network.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          (Gas estimation placeholder)
        </Typography>
      </Paper>
    </Box>
  );
};

export default Step4Review;