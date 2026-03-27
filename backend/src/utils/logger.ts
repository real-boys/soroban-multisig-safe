import winston from 'winston';
import axios from 'axios';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// ELK-compatible format
const elkFormat = winston.format.combine(
  winston.format.timestamp({ format: 'ISO8601' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(({ timestamp, level, message, ...meta }) => ({
    '@timestamp': timestamp,
    level: level.toUpperCase(),
    message,
    service: 'stellar-multisig-safe',
    environment: process.env.NODE_ENV || 'development',
    ...meta,
  })),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: elkFormat,
  }),
  new winston.transports.File({ 
    filename: 'logs/all.log',
    format: elkFormat,
  }),
];

export const logger = winston.createLogger({
  level: level(),
  levels,
  format: elkFormat,
  transports,
});

/**
 * Send log directly to Logstash for ELK integration
 */
export async function sendToLogstash(
  logLevel: string,
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  const logstashUrl = process.env.LOGSTASH_URL;
  if (!logstashUrl) return;

  try {
    await axios.post(`http://${logstashUrl}/logs`, {
      '@timestamp': new Date().toISOString(),
      level: logLevel.toUpperCase(),
      message,
      service: 'stellar-multisig-safe',
      environment: process.env.NODE_ENV || 'production',
      ...metadata,
    }, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.warn('Failed to send log to Logstash:', error);
  }
}
