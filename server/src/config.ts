import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

const adminPassword = required('ADMIN_PASSWORD');
if (adminPassword.length < 12 || Buffer.byteLength(adminPassword, 'utf8') > 72) {
  throw new Error('ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes.');
}
const adminUsername = required('ADMIN_USERNAME');
if (adminUsername.length > 64) {
  throw new Error('ADMIN_USERNAME must be no longer than 64 characters.');
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbHost: required('DB_HOST'),
  dbPort: Number(process.env.DB_PORT ?? 3306),
  dbName: required('DB_DATABASE'),
  dbUser: required('DB_USER'),
  dbPassword: required('DB_PASSWORD'),
  adminUsername,
  adminPassword,
  jwtSecret,
};
