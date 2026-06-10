import express, { Request, Response, NextFunction } from 'express';
import { isRedisReady } from './redis/client';
import stubsRouter from './routes/stubs';

const app = express();

// JSON body parsing
app.use(express.json());

// Health check - returns 200 when the process is running
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness check - returns 200 only when Redis is responsive within 5 seconds
app.get('/ready', async (_req: Request, res: Response) => {
  const redisReady = await isRedisReady(5000);

  if (!redisReady) {
    res.status(503).json({
      status: 'unavailable',
      dependencies: {
        redis: 'unavailable',
      },
    });
    return;
  }

  res.status(200).json({ status: 'ready' });
});

// Stub management routes
app.use('/stubs', stubsRouter);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
