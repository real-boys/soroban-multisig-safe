import React, { useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Box,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

// Components
import OwnerForm from '@/components/Wallet/OwnerForm';
import ThresholdForm from '@/components/Wallet/ThresholdForm';
import RecoveryForm from '@/components/Wallet/RecoveryForm';
import WalletSummary from '@/components/Wallet/WalletSummary';

// Services
import { walletService } from '@/services/walletService';
import { stellarService } from '@/services/stellarService';

// Types
import { CreateWalletRequest } from '@/types/wallet';

const steps = ['Configure Owners', 'Set Threshold', 'Recovery Settings', 'Review & Create'];

const validationSchema = yup.object().shape({
  name: yup.string().required('Wallet name is required').min(1).max(100),
  owners: yup.array()
    .of(yup.string().required('Owner address is required'))
    .min(1, 'At least one owner is required')
    .max(10, 'Maximum 10 owners allowed'),
  threshold: yup.number()
    .required('Threshold is required')
    .min(1, 'Threshold must be at least 1')
    .max(10, 'Threshold cannot exceed 10'),
  recoveryAddress: yup.string().required('Recovery address is required'),
  recoveryDelay: yup.number()
    .required('Recovery delay is required')
    .min(86400, 'Recovery delay must be at least 24 hours'),
});

const CreateWalletPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [walletData, setWalletData] = useState<Partial<CreateWalletRequest>>({});

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    trigger,
  } = useForm<CreateWalletRequest>({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      name: '',
      owners: [''],
      threshold: 2,
      recoveryAddress: '',
      recoveryDelay: 7 * 24 * 60 * 60, // 7 days
    },
  });

  const watchedValues = watch();

  // Create wallet mutation
  const createWalletMutation = useMutation({
    mutationFn: walletService.createWallet,
    onSuccess: (data) => {
      toast.success('Multi-signature wallet created successfully!');
      navigate(`/wallets/${data.id}`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || 'Failed to create wallet');
    },
  });

  const handleNext = async () => {
    const fieldsToValidate = getFieldsForStep(activeStep);
    const isStepValid = await trigger(fieldsToValidate as any);

    if (isStepValid) {
      if (activeStep === steps.length - 1) {
        // Final step - create wallet
        const formData = handleSubmit((data) => {
          createWalletMutation.mutate(data);
        });
        formData();
      } else {
        setActiveStep((prev) => prev + 1);
      }
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const getFieldsForStep = (step: number): string[] => {
    switch (step) {
      case 0:
        return ['name', 'owners'];
      case 1:
        return ['threshold'];
      case 2:
        return ['recoveryAddress', 'recoveryDelay'];
      default:
        return [];
    }
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <OwnerForm
            control={control}
            errors={errors}
            setValue={setValue}
            watchedValues={watchedValues}
          />
        );
      case 1:
        return (
          <ThresholdForm
            control={control}
            errors={errors}
            owners={watchedValues.owners || []}
          />
        );
      case 2:
        return (
          <RecoveryForm
            control={control}
            errors={errors}
          />
        );
      case 3:
        return (
          <WalletSummary
            walletData={watchedValues}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Create Multi-Signature Wallet
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Set up a secure multi-signature wallet with time-lock recovery on the Stellar network.
        </Typography>

        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {createWalletMutation.isPending ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Creating wallet and deploying smart contract...</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ mb: 4 }}>
              {getStepContent(activeStep)}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button
                disabled={activeStep === 0}
                onClick={handleBack}
                variant="outlined"
              >
                Back
              </Button>
              <Button
                onClick={handleNext}
                variant="contained"
                disabled={createWalletMutation.isPending}
              >
                {activeStep === steps.length - 1 ? 'Create Wallet' : 'Next'}
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Container>
  );
};

export default CreateWalletPage;
