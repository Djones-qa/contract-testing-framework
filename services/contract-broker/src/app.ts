import express, { Request, Response, NextFunction } from 'express';
import { pool } from './db/pool';
import { redis, pingRedis } from './redis/client';
import contractsRouter from './routes/contracts';
import verificationRouter from './routes/verification';
import matrixRouter from './routes/matrix';

const app = express();

// JSON body parsing
app.use(express.json());

// Health check — returns 200 if the process is running
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness check — verifies PostgreSQL and Redis connectivity
app.get('/ready', async (_req: Request, res: Response) => {
  const unavailable: string[] = [];

  // Check PostgreSQL connectivity with 5-second timeout
  try {
    const pgResult = await Promise.race([
      pool.query('SELECT 1'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PostgreSQL ping timeout')), 5000)
      ),
    ]);
    if (!pgResult) {
      unavailable.push('postgresql');
    }
  } catch {
    unavailable.push('postgresql');
  }

  // Check Redis connectivity with 5-second timeout
  const redisOk = await pingRedis(5000);
  if (!redisOk) {
    unavailable.push('redis');
  }

  if (unavailable.length > 0) {
    return res.status(503).json({
      status: 'unavailable',
      unavailable,
    });
  }

  return res.status(200).json({ status: 'ready' });
});

// Contract routes
app.use('/contracts', contractsRouter);

// Verification routes (POST /contracts/:id/verify)
app.use('/', verificationRouter);

// Matrix routes
app.use('/matrix', matrixRouter);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
