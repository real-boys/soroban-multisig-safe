import React from 'react';
import { Box, Typography, Slider, Tooltip, Stack } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface Step2ThresholdProps {
  threshold: number;
  setThreshold: (value: number) => void;
  numSigners: number;
}

const Step2Threshold: React.FC<Step2ThresholdProps> = ({
  threshold,
  setThreshold,
  numSigners,
}) => {
  const marks = Array.from({ length: numSigners }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}`,
  }));

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} mb={1}>
        <Typography variant="h6" gutterBottom mb={0}>
          Set Signature Threshold
        </Typography>
        <Tooltip
          title="The number of signatures required to approve a transaction. For example, '2 out of 3' means 2 signatures are needed from the 3 total signers."
          arrow
        >
          <InfoOutlinedIcon color="action" sx={{ cursor: 'pointer' }} />
        </Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Choose how many signers are required to confirm a transaction before it can be executed.
      </Typography>

      <Box sx={{ px: 3 }}>
        <Slider
          value={threshold}
          onChange={(_, newValue) => setThreshold(newValue as number)}
          aria-labelledby="threshold-slider"
          valueLabelDisplay="auto"
          step={1}
          marks={marks}
          min={1}
          max={numSigners}
          disabled={numSigners === 0}
        />
      </Box>

      <Typography variant="h5" align="center" mt={4}>
        {numSigners > 0
          ? `A transaction will require ${threshold} out of ${numSigners} signer(s).`
          : 'Add signers in the previous step to set a threshold.'}
      </Typography>
    </Box>
  );
};

export default Step2Threshold;