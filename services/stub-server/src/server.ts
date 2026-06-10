import app from './app';
import { getRedisClient, disconnectRedis } from './redis/client';

const PORT = parseInt(process.env.PORT || '4001', 10);

async function start(): Promise<void> {
  // Ensure Redis connection is established
  const redis = getRedisClient();
  await redis.connect();

  const server = app.listen(PORT, () => {
    console.log(`Stub Server listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down Stub Server...');
    server.close();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start Stub Server:', err);
  process.exit(1);
});
