import { Redis } from 'ioredis';
import { config } from '../config.js';

export const publisher = new Redis(config.REDIS_URL);
export const subscriber = new Redis(config.REDIS_URL);

publisher.on('error', (err) => console.error('[Redis publisher]', err.message));
subscriber.on('error', (err) => console.error('[Redis subscriber]', err.message));
