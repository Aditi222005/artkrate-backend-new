const { createClient } = require('redis');

let client = null;
let isRedisReady = false;

const initRedis = async () => {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  client = createClient({ url: redisUrl });

  client.on('error', (err) => {
    // Only warn once during startup or if connection state changes
    if (isRedisReady) {
      console.warn('⚠️  Redis connection lost:', err.message);
    }
    isRedisReady = false;
  });

  client.on('connect', () => {
    console.log('🔌 Connecting to Redis server...');
  });

  client.on('ready', () => {
    console.log('🚀 Redis connection successfully established!');
    isRedisReady = true;
  });

  try {
    await client.connect();
  } catch (err) {
    console.warn('⚠️  Failed to connect to Redis. Caching is disabled. Falling back to MongoDB.', err.message);
    isRedisReady = false;
  }
};

const getCache = async (key) => {
  if (!isRedisReady || !client) return null;
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn(`Redis getCache error:`, err.message);
    return null;
  }
};

const setCache = async (key, value, ttl = 30) => {
  if (!isRedisReady || !client) return;
  try {
    await client.set(key, JSON.stringify(value), {
      EX: ttl // Expire time in seconds
    });
  } catch (err) {
    console.warn(`Redis setCache error:`, err.message);
  }
};

const delCache = async (key) => {
  if (!isRedisReady || !client) return;
  try {
    await client.del(key);
  } catch (err) {
    console.warn(`Redis delCache error:`, err.message);
  }
};

module.exports = {
  initRedis,
  getCache,
  setCache,
  delCache,
  isReady: () => isRedisReady
};
