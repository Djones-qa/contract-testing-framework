import app from './app';
import { redis } from './redis/client';
import { closePool } from './db/pool';
import { closeRedis } from './redis/client';

const PORT = parseInt(process.env.PORT || '4000', 10);

async function start(): Promise<void> {
  // Connect Redis (lazyConnect mode requires explicit connect)
  await redis.connect();

  const server = app.listen(PORT, () => {
    console.log(`Contract Broker listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    server.close();
    await closeRedis();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start Contract Broker:', err);
  process.exit(1);
});
