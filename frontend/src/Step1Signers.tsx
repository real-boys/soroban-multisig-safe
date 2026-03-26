import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Typography,
  Alert,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { StrKey } from '@stellar/stellar-sdk';
import { Signer } from './CreateSafeWizard';

interface Step1SignersProps {
  signers: Signer[];
  setSigners: React.Dispatch<React.SetStateAction<Signer[]>>;
  userPublicKey: string;
}

const Step1Signers: React.FC<Step1SignersProps> = ({ signers, setSigners, userPublicKey }) => {
  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [error, setError] = useState('');

  const handleAddSigner = () => {
    if (!name || !publicKey) {
      setError('Name and Public Key are required.');
      return;
    }
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      setError('Invalid Stellar Public Key.');
      return;
    }
    if (signers.some((s) => s.publicKey === publicKey)) {
      setError('This public key has already been added.');
      return;
    }

    setSigners([...signers, { name, publicKey }]);
    setName('');
    setPublicKey('');
    setError('');
  };

  const handleRemoveSigner = (keyToRemove: string) => {
    setSigners(signers.filter((s) => s.publicKey !== keyToRemove));
  };

  const isUserKeyIncluded = signers.some((s) => s.publicKey === userPublicKey);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Add Initial Signers
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Add the public keys of the addresses that will be owners of this safe.
      </Typography>

      {!isUserKeyIncluded && userPublicKey && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your own public key is not included as a signer. You will not be able to sign transactions unless you add it.
        </Alert>
      )}

      <Box display="flex" gap={2} mb={2}>
        <TextField
          label="Signer Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
        />
        <TextField
          label="Public Key (G...)"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          fullWidth
          error={!!error}
          helperText={error}
        />
        <Button variant="contained" onClick={handleAddSigner} sx={{ whiteSpace: 'nowrap' }}>
          Add Signer
        </Button>
      </Box>

      <List>
        {signers.map((signer) => (
          <ListItem
            key={signer.publicKey}
            secondaryAction={
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => handleRemoveSigner(signer.publicKey)}
                disabled={signer.publicKey === userPublicKey} // Prevent removing self easily
              >
                <DeleteIcon />
              </IconButton>
            }
          >
            <ListItemText
              primary={signer.name}
              secondary={`${signer.publicKey.substring(0, 8)}...${signer.publicKey.substring(48)}`}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default Step1Signers;