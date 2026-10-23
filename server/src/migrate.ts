import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from './db';

async function migrate(): Promise<void> {
  const sql = await readFile(join(__dirname, '../migrations/001_initial.sql'), 'utf8');
  const connection = await pool.getConnection();
  try {
    for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
    console.log('Database schema is up to date.');
  } finally {
    connection.release();
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
});
