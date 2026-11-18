// The services fieldtec-web runs on (MongoDB, Elasticsearch, Redis), for the setup and seed scripts.
// Redis is spoken to over its wire protocol, so neither script needs a Redis client or redis-cli.

import { MongoClient } from 'mongodb';
import net from 'node:net';

/** Existing application databases on the shared local stack. The seed never touches these. */
export const PROTECTED_DATABASES = ['admin', 'local', 'config', 'formbird', 'fieldtec-test', 'internal-5', 'clarity-dev', 'monstache'];

/**
 * The services a fieldtec-web server config points at, so the database is created where the server
 * will look for it.
 * @param {Record<string, any>} config fieldtec-web server config (server/config/<name>.json)
 * @returns {{ mongo: string, es: string, redis: string }} redis is `host:port`
 */
export function serviceUrls(config) {
  const mongo = config.dataServices?.default ?? {};
  const esHost = String(config.elasticsearch?.host ?? 'localhost:9200');
  return {
    mongo: `mongodb://${mongo.host ?? 'localhost'}:${mongo.port ?? 27017}/?directConnection=true`,
    es: (/^https?:\/\//.test(esHost) ? esHost : `http://${esHost}`).replace(/\/$/, ''),
    redis: `${config.redis?.host ?? 'localhost'}:${config.redis?.port ?? 6379}`,
  };
}

/**
 * MongoDB's version, replica set and how many documents the database already holds.
 * @returns {Promise<{ version: string, replicaSet: string | undefined, documents: number }>}
 */
export async function mongoStatus(url, dbName) {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const admin = client.db('admin');
    const [{ version }, hello] = await Promise.all([admin.command({ buildInfo: 1 }), admin.command({ hello: 1 })]);
    const documents = await client.db(dbName).collection('documents').estimatedDocumentCount();
    return { version, replicaSet: hello.setName, documents };
  } finally {
    await client.close();
  }
}

/**
 * A one-line reason for a connection failure. `fetch` wraps it in a cause, and a refused `localhost`
 * connection is an AggregateError (IPv6 and IPv4) whose own message is empty.
 */
export function describeError(error) {
  let inner = error;
  while (inner?.cause) inner = inner.cause;
  if (inner?.errors?.length) return [...new Set(inner.errors.map((e) => e.message))].join(', ');
  return inner?.message || error?.message || String(error);
}

/** Elasticsearch's version number. */
export async function elasticsearchVersion(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Elasticsearch at ${url} answered HTTP ${response.status}`);
  return (await response.json()).version?.number ?? 'unknown version';
}

const CRLF = '\r\n';

/**
 * Sends Redis commands on one connection and resolves with their one-line replies. Enough for
 * PING, SELECT and FLUSHDB.
 * @param {string} hostPort `host:port`
 * @param {(string | number)[][]} commands
 */
export function redisCommands(hostPort, commands) {
  const [host, port] = hostPort.split(':');
  const encode = (args) => `*${args.length}${CRLF}${args.map((a) => `$${Buffer.byteLength(String(a))}${CRLF}${a}${CRLF}`).join('')}`;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) || 6379 });
    let replies = '';
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error(`Redis at ${hostPort} did not answer`));
    });
    socket.on('error', reject);
    socket.on('connect', () => socket.write(commands.map(encode).join('')));
    socket.on('data', (chunk) => {
      replies += chunk;
      const lines = replies.split(CRLF).filter(Boolean);
      const error = lines.find((line) => line.startsWith('-'));
      if (error) {
        socket.end();
        reject(new Error(`Redis at ${hostPort}: ${error.slice(1)}`));
      } else if (lines.length >= commands.length) {
        socket.end();
        resolve(lines);
      }
    });
  });
}

/** Empties one Redis database: fieldtec-web's cached rules, templates and config, and its sessions. */
export const flushRedis = (hostPort, dbNumber) => redisCommands(hostPort, [['SELECT', dbNumber], ['FLUSHDB']]);
