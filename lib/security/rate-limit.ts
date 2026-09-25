import { Socket } from "node:net";
import { connect as connectTls, TLSSocket } from "node:tls";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type ConsumeRateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type ConsumeRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

declare global {
  var __jaxerRateLimitStore: Map<string, RateLimitEntry> | undefined;
}

function getStore() {
  if (!globalThis.__jaxerRateLimitStore) {
    globalThis.__jaxerRateLimitStore = new Map<string, RateLimitEntry>();
  }

  return globalThis.__jaxerRateLimitStore;
}

function cleanupExpiredEntries(now: number, store: Map<string, RateLimitEntry>) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

function consumeMemoryRateLimit({
  key,
  limit,
  windowMs,
}: ConsumeRateLimitOptions): ConsumeRateLimitResult {
  const now = Date.now();
  const store = getStore();

  cleanupExpiredEntries(now, store);

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      resetAt,
    };
  }

  existing.count += 1;
  store.set(key, existing);

  const remaining = Math.max(0, limit - existing.count);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );

  return {
    allowed: existing.count <= limit,
    remaining,
    retryAfterSeconds,
    resetAt: existing.resetAt,
  };
}

type RedisConnectionConfig = {
  host: string;
  port: number;
  password: string | null;
  db: number;
  tls: boolean;
};

declare global {
  var __jaxerRateLimitRedisWarningShown: boolean | undefined;
}

function getRedisConfig(): RedisConnectionConfig | null {
  const redisUrl = process.env.RATE_LIMIT_REDIS_URL?.trim();
  if (!redisUrl) return null;

  try {
    const url = new URL(redisUrl);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      return null;
    }

    return {
      host: url.hostname,
      port: Number(url.port || "6379"),
      password: url.password || null,
      db: Number(url.pathname.replace("/", "") || "0"),
      tls: url.protocol === "rediss:",
    };
  } catch {
    return null;
  }
}

function encodeBulkString(value: string) {
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

function encodeCommand(args: string[]) {
  return `*${args.length}\r\n${args.map(encodeBulkString).join("")}`;
}

function parseRedisSimpleResponse(buffer: Buffer) {
  const raw = buffer.toString("utf8");
  const lines = raw.split("\r\n").filter(Boolean);

  return lines
    .map((line) => {
      const prefix = line[0];
      const body = line.slice(1);

      if (prefix === ":") return Number(body);
      if (prefix === "+") return body;
      if (prefix === "-") throw new Error(body || "Redis error");
      if (prefix === "$") return null;

      return body;
    })
    .filter((value) => value !== null);
}

async function executeRedisCommands(commands: string[][]) {
  const config = getRedisConfig();
  if (!config) return null;

  return new Promise<Array<string | number>>((resolve, reject) => {
    const socket: Socket | TLSSocket = config.tls
      ? connectTls({
          host: config.host,
          port: config.port,
          servername: config.host,
          rejectUnauthorized: process.env.RATE_LIMIT_REDIS_TLS_REJECT_UNAUTHORIZED !== "false",
        })
      : new Socket();
    const chunks: Buffer[] = [];

    socket.setTimeout(2000);

    socket.on("data", (chunk) => {
      chunks.push(chunk);
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Redis connection timeout"));
    });

    socket.on("error", (error) => {
      reject(error);
    });

    socket.on("close", () => {
      try {
        const parsed = parseRedisSimpleResponse(Buffer.concat(chunks));
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });

    const writePayload = () => {
      const payload = [
        ...(config.password ? [["AUTH", config.password]] : []),
        ...(config.db ? [["SELECT", String(config.db)]] : []),
        ...commands,
      ]
        .map(encodeCommand)
        .join("");

      socket.end(payload);
    };

    if (config.tls) {
      socket.once("secureConnect", writePayload);
    } else {
      socket.connect(config.port, config.host, writePayload);
    }
  });
}

async function consumeRedisRateLimit({
  key,
  limit,
  windowMs,
}: ConsumeRateLimitOptions): Promise<ConsumeRateLimitResult | null> {
  const config = getRedisConfig();
  if (!config) return null;

  const namespacedKey = `rate-limit:${key}`;
  const now = Date.now();

  try {
    const responses = await executeRedisCommands([
      ["INCR", namespacedKey],
      ["PTTL", namespacedKey],
    ]);

    if (!responses || responses.length < 2) {
      return null;
    }

    const count = Number(responses[responses.length - 2]);
    let ttlMs = Number(responses[responses.length - 1]);

    if (!Number.isFinite(count)) return null;

    if (!Number.isFinite(ttlMs) || ttlMs < 0 || count === 1) {
      const expireResponses = await executeRedisCommands([
        ["PEXPIRE", namespacedKey, String(windowMs)],
        ["PTTL", namespacedKey],
      ]);
      if (!expireResponses || expireResponses.length < 2) {
        return null;
      }

      ttlMs = Number(expireResponses[expireResponses.length - 1]);
    }

    const resetAt = now + Math.max(ttlMs, 0);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil(Math.max(ttlMs, 0) / 1000)),
      resetAt,
    };
  } catch {
    return null;
  }
}

function logRedisFallbackOnce() {
  if (globalThis.__jaxerRateLimitRedisWarningShown) return;

  globalThis.__jaxerRateLimitRedisWarningShown = true;
  console.warn(
    "[rate-limit] Redis rate limit store unavailable. Falling back to in-memory store.",
  );
}

function isStrictProductionRateLimitRequired() {
  return process.env.NODE_ENV === "production";
}

export async function consumeRateLimit(
  options: ConsumeRateLimitOptions,
): Promise<ConsumeRateLimitResult> {
  const redisResult = await consumeRedisRateLimit(options);
  if (redisResult) {
    return redisResult;
  }

  if (isStrictProductionRateLimitRequired()) {
    throw new Error(
      "Rate limit Redis store is required in production. Configure RATE_LIMIT_REDIS_URL and ensure Redis is reachable.",
    );
  }

  if (process.env.RATE_LIMIT_REDIS_URL?.trim()) {
    logRedisFallbackOnce();
  }

  return consumeMemoryRateLimit(options);
}

export async function getRateLimitStoreHealth() {
  const config = getRedisConfig();
  if (!config) {
    return {
      mode: "memory" as const,
      connected: !isStrictProductionRateLimitRequired(),
      detail: isStrictProductionRateLimitRequired()
        ? "RATE_LIMIT_REDIS_URL is empty. Production requires Redis-backed rate limiting."
        : "RATE_LIMIT_REDIS_URL is empty. Using in-memory rate limit store.",
    };
  }

  try {
    const responses = await executeRedisCommands([["PING"]]);
    const pong = responses?.[responses.length - 1];

    if (pong === "PONG") {
      return {
        mode: "redis" as const,
        connected: true,
        detail: `Connected to ${config.tls ? "rediss" : "redis"}://${config.host}:${config.port}/${config.db}`,
      };
    }

    return {
      mode: "redis" as const,
      connected: false,
      detail: "Redis did not return PONG. Falling back to in-memory store.",
    };
  } catch (error) {
    return {
      mode: "redis" as const,
      connected: false,
      detail:
        error instanceof Error
          ? error.message
          : "Unknown Redis connectivity error",
    };
  }
}
