import { Redis } from "@upstash/redis";

/**
 * Upstash Redis over HTTPS (free tier). Holds the exhibit view counts and the
 * site-wide daily cap on `ask`. Null when unconfigured: views answer 503 and
 * `ask` falls back to an in-memory daily count.
 */
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
export const redis = url && token ? new Redis({ url, token }) : null;
