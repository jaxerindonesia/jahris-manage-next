import { Socket } from "node:net";
import { connect as connectTls, TLSSocket } from "node:tls";

type RedisConnectionConfig = {
  host: string;
  port: number;
  password: string | null;
  db: number;
  tls: boolean;
};

declare global {
  var __jaxerRedisCacheWarningShown: boolean | undefined;
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

function parseRedisResponse(raw: string, index = 0): [unknown, number] {
  const prefix = raw[index];
  const lineEnd = raw.indexOf("\r\n", index);

  if (lineEnd === -1) {
    throw new Error("Invalid Redis response");
  }

  const payload = raw.slice(index + 1, lineEnd);
  const nextIndex = lineEnd + 2;

  if (prefix === "+") return [payload, nextIndex];
  if (prefix === ":") return [Number(payload), nextIndex];
  if (prefix === "-") throw new Error(payload || "Redis error");
  if (prefix === "$") {
    const size = Number(payload);
    if (size === -1) return [null, nextIndex];
    const value = raw.slice(nextIndex, nextIndex + size);
    return [value, nextIndex + size + 2];
  }
  if (prefix === "*") {
    const count = Number(payload);
    if (count === -1) return [null, nextIndex];
    const items: unknown[] = [];
    let cursor = nextIndex;
    for (let i = 0; i < count; i += 1) {
      const [value, next] = parseRedisResponse(raw, cursor);
      items.push(value);
      cursor = next;
    }
    return [items, cursor];
  }

  throw new Error("Unsupported Redis response");
}

async function executeRedisCommands(commands: string[][]) {
  const config = getRedisConfig();
  if (!config) return null;

  return new Promise<unknown[] | null>((resolve, reject) => {
    const socket: Socket | TLSSocket = config.tls
      ? connectTls({
          host: config.host,
          port: config.port,
          servername: config.host,
          rejectUnauthorized:
            process.env.RATE_LIMIT_REDIS_TLS_REJECT_UNAUTHORIZED !== "false",
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
        const raw = Buffer.concat(chunks).toString("utf8");
        const parsed: unknown[] = [];
        let cursor = 0;

        while (cursor < raw.length) {
          const [value, next] = parseRedisResponse(raw, cursor);
          parsed.push(value);
          cursor = next;
        }

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

function logRedisCacheFallbackOnce(error?: unknown) {
  if (globalThis.__jaxerRedisCacheWarningShown) return;
  globalThis.__jaxerRedisCacheWarningShown = true;
  console.warn(
    "[redis-cache] Redis unavailable. Falling back to direct database reads.",
    error instanceof Error ? error.message : "",
  );
}

export async function getOrSetRedisJsonCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const config = getRedisConfig();
  if (!config) {
    return loader();
  }

  try {
    const cached = await executeRedisCommands([["GET", key]]);
    const value = Array.isArray(cached) ? cached[cached.length - 1] : null;

    if (typeof value === "string") {
      return JSON.parse(value) as T;
    }
  } catch (error) {
    logRedisCacheFallbackOnce(error);
    return loader();
  }

  const fresh = await loader();

  try {
    await executeRedisCommands([
      ["SET", key, JSON.stringify(fresh), "EX", String(ttlSeconds)],
    ]);
  } catch (error) {
    logRedisCacheFallbackOnce(error);
  }

  return fresh;
}
