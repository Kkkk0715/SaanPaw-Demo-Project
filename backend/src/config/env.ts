import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
export const isProduction = nodeEnv === 'production';

const WEAK_SECRETS = ['dev-secret', 'change-me-in-production', 'secret', 'changeme'];

function required(name: string, devFallback?: string): string {
  // Production never falls back to a development default: a forgotten variable must stop the boot.
  const value = process.env[name] ?? (isProduction ? undefined : devFallback);
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Some hosts (Vercel included) create a variable with an empty string rather than leaving it
 * unset when a form field is left blank, which `??` alone would not fall back on.
 */
function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function optionalNumber(name: string, fallback: number): number {
  return Number(optional(name, String(fallback)));
}

function jwtSecret(): string {
  const secret = required('JWT_SECRET', 'dev-secret');
  if (isProduction && (WEAK_SECRETS.includes(secret) || secret.length < 32)) {
    throw new Error('JWT_SECRET must be a random string of at least 32 characters in production.');
  }
  return secret;
}

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const env = {
  port: optionalNumber('PORT', 4001),
  nodeEnv,
  isProduction,
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/saanpaw'),
  jwtSecret: jwtSecret(),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),
  /**
   * Browser origins allowed to call the API (the web console and the web build of the app).
   * Empty means any origin in development and none in production. Native apps do not use CORS.
   */
  corsOrigins: list(process.env.CORS_ORIGINS),
  /** Hops of reverse proxy in front of the API (0 = none), so rate limits see the real client address. */
  trustProxy: optionalNumber('TRUST_PROXY', 0),
  uploadDir: optional('UPLOAD_DIR', 'uploads'),
  publicBaseUrl: optional('PUBLIC_BASE_URL', 'http://localhost:4000'),
  imageRecognition: {
    model: optional('IR_MODEL', 'mobilenet_v3'),
    matchThreshold: optionalNumber('IR_MATCH_THRESHOLD', 0.82),
    maxResults: optionalNumber('IR_MAX_RESULTS', 10),
  },
  alerts: {
    defaultUserRadius: optionalNumber('DEFAULT_USER_ALERT_RADIUS', 3000),
    defaultShelterRadius: optionalNumber('DEFAULT_SHELTER_RADIUS', 5000),
  },
  moderation: {
    falseReportBanThreshold: optionalNumber('MODERATION_FALSE_REPORT_BAN_THRESHOLD', 3),
  },
};
