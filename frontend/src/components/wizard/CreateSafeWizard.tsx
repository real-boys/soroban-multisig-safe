import React, { useState, useEffect } from 'react';
import { Box, Stepper, Step, StepLabel, Button, Typography, Container } from '@mui/material';
import { useWallet } from '../../hooks/useWallet';
import { Signer } from '../../types/transaction';
import Step1Signers from './Step1Signers';
import Step2Threshold from './Step2Threshold';
import Step3Recovery from './Step3Recovery';
import Step4Review from './Step4Review';
import SuccessScreen from './SuccessScreen';

const steps = ['Add Signers', 'Set Threshold', 'Configure Recovery', 'Review & Deploy'];

const CreateSafeWizard: React.FC = () => {
  const { publicKey } = useWallet();
  const [activeStep, setActiveStep] = useState(0);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [threshold, setThreshold] = useState(1);
  const [recoveryAddress, setRecoveryAddress] = useState('');
  const [recoveryDelay, setRecoveryDelay] = useState(30);
  const [newContractId, setNewContractId] = useState('');

  useEffect(() => {
    if (publicKey && signers.length === 0) {
      setSigners([{ name: 'Me', publicKey }]);
    }
  }, [publicKey, signers.length]);

  const isUserKeyIncluded = signers.some((s) => s.publicKey === publicKey);

  const handleNext = () => setActiveStep((prev) => prev + 1);
  const handleBack = () => setActiveStep((prev) => prev - 1);

  const handleReset = () => {
    setActiveStep(0);
    setSigners(publicKey ? [{ name: 'Me', publicKey }] : []);
    setThreshold(1);
    setRecoveryAddress('');
    setRecoveryDelay(30);
    setNewContractId('');
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return <Step1Signers signers={signers} setSigners={setSigners} userPublicKey={publicKey} />;
      case 1:
        return (
          <Step2Threshold threshold={threshold} setThreshold={setThreshold} numSigners={signers.length} />
        );
      case 2:
        return (
          <Step3Recovery
            recoveryAddress={recoveryAddress}
            setRecoveryAddress={setRecoveryAddress}
            recoveryDelay={recoveryDelay}
            setRecoveryDelay={setRecoveryDelay}
          />
        );
      case 3:
        return (
          <Step4Review
            signers={signers}
            threshold={threshold}
            recoveryAddress={recoveryAddress}
            recoveryDelay={recoveryDelay}
          />
        );
      default:
        return 'Unknown step';
    }
  };

  return (
    <Container maxWidth="md">
      <Typography variant="h4" gutterBottom sx={{ mb: 4 }}>
        Create a New Multi-Sig Safe
      </Typography>
      <Stepper activeStep={activeStep} sx={{ mb: 5 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {activeStep === steps.length ? (
        <SuccessScreen contractId={newContractId} onReset={handleReset} />
      ) : (
        <>
          {getStepContent(activeStep)}
          <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2, mt: 4 }}>
            <Button color="inherit" disabled={activeStep === 0} onClick={handleBack} sx={{ mr: 1 }}>
              Back
            </Button>
            <Box sx={{ flex: '1 1 auto' }} />
            {activeStep === steps.length - 1 ? (
              <Button
                variant="contained"
                onClick={async () => {
                  await new Promise((resolve) => setTimeout(resolve, 1500));
                  const mockId = 'C' + Math.random().toString(36).substring(2, 57).toUpperCase();
                  setNewContractId(mockId);
                  handleNext();
                }}
              >
                Deploy
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={handleNext}
                disabled={activeStep === 0 && (!isUserKeyIncluded || signers.length === 0)}
              >
                Next
              </Button>
            )}
          </Box>
        </>
      )}
    </Container>
  );
};

export default CreateSafeWizard;
