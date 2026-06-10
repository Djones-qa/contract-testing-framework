import express, { Request, Response } from 'express';
import http from 'http';
import { verifyRouter } from './routes/verify';

const app = express();

app.use(express.json());
app.use(verifyRouter);

function getBrokerUrl(): string {
  return process.env.BROKER_URL || 'http://localhost:4000';
}

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ready', async (_req: Request, res: Response) => {
  try {
    await checkBrokerHealth(getBrokerUrl());
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable', reason: 'Contract Broker is unreachable' });
  }
});

function checkBrokerHealth(brokerUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL('/health', brokerUrl);
    const req = http.get(url.toString(), { timeout: 5000 }, (response) => {
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        response.resume();
        resolve();
      } else {
        response.resume();
        reject(new Error(`Broker returned status ${response.statusCode}`));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Broker health check timed out'));
    });
  });
}

export { app, getBrokerUrl };
