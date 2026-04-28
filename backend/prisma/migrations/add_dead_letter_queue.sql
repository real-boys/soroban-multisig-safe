-- Create Dead Letter Queue table
-- This table stores messages that have failed all retry attempts

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id VARCHAR(255) PRIMARY KEY,
  original_queue VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  error TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt TIMESTAMP NOT NULL,
  last_attempt TIMESTAMP NOT NULL,
  retry_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_dlq_original_queue ON dead_letter_queue(original_queue);
CREATE INDEX IF NOT EXISTS idx_dlq_created_at ON dead_letter_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_dlq_last_attempt ON dead_letter_queue(last_attempt);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dlq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dlq_updated_at
  BEFORE UPDATE ON dead_letter_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_dlq_updated_at();

-- Add comment to table
COMMENT ON TABLE dead_letter_queue IS 'Stores messages that have failed all retry attempts for manual intervention';
COMMENT ON COLUMN dead_letter_queue.id IS 'Unique identifier for the failed message';
COMMENT ON COLUMN dead_letter_queue.original_queue IS 'Name of the queue where the message originally failed';
COMMENT ON COLUMN dead_letter_queue.payload IS 'Original message payload as JSON';
COMMENT ON COLUMN dead_letter_queue.error IS 'Error message from the last failed attempt';
COMMENT ON COLUMN dead_letter_queue.attempts IS 'Number of retry attempts made';
COMMENT ON COLUMN dead_letter_queue.first_attempt IS 'Timestamp of the first attempt';
COMMENT ON COLUMN dead_letter_queue.last_attempt IS 'Timestamp of the last attempt';
COMMENT ON COLUMN dead_letter_queue.retry_history IS 'JSON array of all retry attempts with details';
COMMENT ON COLUMN dead_letter_queue.metadata IS 'Additional metadata about the message';
