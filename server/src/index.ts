import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import type * as mysql from 'mysql2';
import { randomUUID } from 'node:crypto';
import { config } from './config';
import { pool } from './db';
import {
  attendanceSchema,
  dateQuerySchema,
  feeSchema,
  loginSchema,
  memberSchema,
} from './validation';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

app.post('/api/auth/login', loginLimiter, async (request, response, next) => {
  try {
    const input = loginSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: 'Enter a username and password.' });
      return;
    }

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, password_hash FROM users WHERE username = ?',
      [input.data.username],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(input.data.password, user.password_hash))) {
      response.status(401).json({ error: 'Username or password is incorrect.' });
      return;
    }

    const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '8h' });
    response.json({ token, username: input.data.username });
  } catch (error) {
    next(error);
  }
});

const authenticate: RequestHandler = (request, response, next) => {
  const authorization = request.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ error: 'Sign in to continue.' });
    return;
  }

  try {
    jwt.verify(authorization.slice(7), config.jwtSecret);
    next();
  } catch {
    response.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
};

app.use('/api', authenticate);

app.get('/api/dashboard', async (request, response, next) => {
  try {
    const parsedDate = dateQuerySchema.safeParse(request.query.date ?? new Date().toISOString().slice(0, 10));
    if (!parsedDate.success) {
      response.status(400).json({ error: 'Use a valid date in YYYY-MM-DD format.' });
      return;
    }
    const [[memberRows], [attendanceRows], [feeRows]] = await Promise.all([
      pool.execute<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) AS count FROM members WHERE active = TRUE',
      ),
      pool.execute<mysql.RowDataPacket[]>(
        'SELECT COUNT(*) AS count FROM attendance WHERE attendance_date = ?',
        [parsedDate.data],
      ),
      pool.execute<mysql.RowDataPacket[]>(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM fees WHERE YEAR(paid_on) = YEAR(?) AND MONTH(paid_on) = MONTH(?)',
        [parsedDate.data, parsedDate.data],
      ),
    ]);
    response.json({
      activeMembers: Number(memberRows[0].count),
      attendanceToday: Number(attendanceRows[0].count),
      feesThisMonth: Number(feeRows[0].total),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/members', async (_request, response, next) => {
  try {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT id, full_name AS fullName, phone, belt_rank AS beltRank, joined_on AS joinedOn, active FROM members ORDER BY active DESC, full_name ASC',
    );
    response.json(rows.map((member) => ({ ...member, active: Boolean(member.active) })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/members', async (request, response, next) => {
  try {
    const input = memberSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: 'Check the name, phone number, and belt rank.' });
      return;
    }
    const member = input.data;
    const id = randomUUID();
    const joinedOn = member.joinedOn ?? new Date().toISOString().slice(0, 10);
    await pool.execute(
      'INSERT INTO members (id, full_name, phone, belt_rank, joined_on) VALUES (?, ?, ?, ?, ?)',
      [
        id,
        member.fullName,
        member.phone,
        member.beltRank,
        joinedOn,
      ],
    );
    response.status(201).json({ id, ...member, joinedOn, active: true });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/members/:id/archive', async (request, response, next) => {
  try {
    const id = zodUuid(request.params.id);
    if (!id) {
      response.status(400).json({ error: 'Invalid member.' });
      return;
    }
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'UPDATE members SET active = FALSE WHERE id = ? AND active = TRUE',
      [id],
    );
    if (result.affectedRows === 0) {
      response.status(404).json({ error: 'Member not found or already archived.' });
      return;
    }
    response.json({ id, active: false });
  } catch (error) {
    next(error);
  }
});

app.get('/api/attendance', async (request, response, next) => {
  try {
    const parsedDate = dateQuerySchema.safeParse(request.query.date ?? new Date().toISOString().slice(0, 10));
    if (!parsedDate.success) {
      response.status(400).json({ error: 'Use a valid date in YYYY-MM-DD format.' });
      return;
    }
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT a.id, a.member_id AS memberId, m.full_name AS fullName, a.attendance_date AS attendanceDate, a.recorded_at AS recordedAt FROM attendance a JOIN members m ON m.id = a.member_id WHERE a.attendance_date = ? ORDER BY a.recorded_at DESC',
      [parsedDate.data],
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/attendance', async (request, response, next) => {
  try {
    const input = attendanceSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: 'Select a valid member and attendance date.' });
      return;
    }
    const id = randomUUID();
    const attendanceDate = input.data.attendanceDate ?? new Date().toISOString().slice(0, 10);
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'INSERT INTO attendance (id, member_id, attendance_date) SELECT ?, id, ? FROM members WHERE id = ? AND active = TRUE',
      [id, attendanceDate, input.data.memberId],
    );
    if (result.affectedRows === 0) {
      response.status(404).json({ error: 'Active member not found.' });
      return;
    }
    response.status(201).json({ id, memberId: input.data.memberId, attendanceDate });
  } catch (error) {
    if (isDuplicate(error)) {
      response.status(409).json({ error: 'Attendance is already recorded for this member and date.' });
      return;
    }
    next(error);
  }
});

app.get('/api/fees', async (_request, response, next) => {
  try {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      'SELECT f.id, f.member_id AS memberId, m.full_name AS fullName, f.amount, f.fee_period AS feePeriod, f.paid_on AS paidOn, f.payment_method AS paymentMethod, f.note FROM fees f JOIN members m ON m.id = f.member_id ORDER BY f.paid_on DESC, f.created_at DESC LIMIT 200',
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/fees', async (request, response, next) => {
  try {
    const input = feeSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ error: 'Enter a member, a positive amount, and a fee period.' });
      return;
    }
    const fee = input.data;
    const id = randomUUID();
    const paidOn = fee.paidOn ?? new Date().toISOString().slice(0, 10);
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      'INSERT INTO fees (id, member_id, amount, fee_period, paid_on, payment_method, note) SELECT ?, id, ?, ?, ?, ?, ? FROM members WHERE id = ? AND active = TRUE',
      [id, fee.amount, fee.feePeriod, paidOn, fee.paymentMethod, fee.note, fee.memberId],
    );
    if (result.affectedRows === 0) {
      response.status(404).json({ error: 'Active member not found.' });
      return;
    }
    response.status(201).json({ id, ...fee, paidOn });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error('Request failed:', error);
  response.status(500).json({ error: 'Something went wrong. Please try again.' });
});

function zodUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY';
}

async function start(): Promise<void> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT id FROM users WHERE username = ?',
    [config.adminUsername],
  );
  if (rows.length === 0) {
    const passwordHash = await bcrypt.hash(config.adminPassword, 12);
    await pool.execute(
      'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
      [randomUUID(), config.adminUsername, passwordHash],
    );
    console.log(`Created first dojo administrator: ${config.adminUsername}`);
  }
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Dojo API listening on port ${config.port}.`);
  });
}

start().catch((error: unknown) => {
  console.error('Could not start the dojo API:', error);
  process.exitCode = 1;
});
