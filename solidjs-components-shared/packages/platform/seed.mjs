// Writes a demo database: Mongo documents + an Elasticsearch index, loaded the same way
// fieldtec-web's `gulp test-setup` loads its test database, then (optionally) flushes the Redis
// database fieldtec-web caches rules, templates and sessions in.

import { MongoClient } from 'mongodb';
import { indexTemplate } from './documents.mjs';
import { flushRedis, PROTECTED_DATABASES } from './services.mjs';

/** Same indexes as fieldtec-web's test database. */
const INDEXES = [
  { documentId: 1 }, { 'systemHeader.currentVersion': 1 }, { 'systemHeader.deleted': 1 }, { 'systemHeader.templateId': 1 },
  { 'systemHeader.keyIds': 1 }, { 'systemHeader.systemType': 1 }, { 'systemHeader.serverCreatedDate': 1 },
  { 'systemHeader.serverUpdatedDate': 1 }, { 'systemHeader.createdDate': 1 }, { appTags: 1 }, { email: 1 },
];

/**
 * Field paths whose values have kinds Elasticsearch can't map together (an object in one document,
 * text in another; a number in one, non-numeric text in another). Elasticsearch maps a field from
 * the first value it sees and rejects later documents that don't fit, so these would fail to index.
 * Arrays are looked through; GeoJSON (`*geometry`, mapped as geo_shape) is skipped.
 * @param {Record<string, any>[]} documents
 * @returns {{ path: string, kinds: string[], examples: string[] }[]}
 */
export function mappingConflicts(documents) {
  const seen = new Map();
  const note = (path, kind, documentId) => {
    const entry = seen.get(path) ?? { kinds: new Map() };
    if (!entry.kinds.has(kind)) entry.kinds.set(kind, documentId);
    seen.set(path, entry);
  };
  const walk = (value, path, documentId) => {
    if (value === null || value === undefined) return;
    if (/geometry$/.test(path)) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, path, documentId);
      return;
    }
    if (value instanceof Date) return note(path, 'date', documentId);
    if (typeof value === 'object') {
      if (value._bsontype) return;
      note(path, 'object', documentId);
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key, documentId);
      return;
    }
    if (typeof value === 'string') return note(path, value.trim() !== '' && !Number.isNaN(Number(value)) ? 'numeric text' : 'text', documentId);
    note(path, typeof value, documentId);
  };
  for (const doc of documents) {
    const { _id, ...body } = doc;
    walk(body, '', doc.documentId);
  }
  const clash = (kinds) => (kinds.includes('object') && kinds.length > 1) || (kinds.includes('number') && kinds.includes('text'));
  return [...seen.entries()]
    .map(([path, entry]) => ({ path, kinds: [...entry.kinds.keys()], examples: [...entry.kinds.values()] }))
    .filter((c) => clash(c.kinds));
}

/**
 * Creates (or with `reset`, replaces) a database and its index from `documents`.
 * @param {{ documents: Record<string, any>[], db: string, index?: string, mongo: string, es: string, reset?: boolean, redis?: string, redisDb?: number, log?: (line: string) => void }} o
 *   `redis` + `redisDb`: the Redis database to flush afterwards (omit to keep it)
 * @returns {Promise<{ inserted: number, indexed: number, failed: number }>}
 * @throws {Error} For a protected database, or a populated one without `reset`
 */
export async function seedDatabase({ documents, db, index = db, mongo, es, reset = false, redis, redisDb = 0, log = console.log }) {
  if (PROTECTED_DATABASES.includes(db)) throw new Error(`Refusing to seed "${db}": it is an existing application database.`);
  const conflicts = mappingConflicts(documents);
  if (conflicts.length) {
    throw new Error(
      `Some fields would not index (a field can't hold different kinds of values):\n${conflicts
        .map((c) => `  ${c.path}: ${c.kinds.join(' / ')} (e.g. documents ${c.examples.join(', ')})`)
        .join('\n')}`,
    );
  }

  const client = new MongoClient(mongo);
  await client.connect();
  try {
    const collection = client.db(db).collection('documents');
    const existing = await collection.estimatedDocumentCount();
    if (existing && !reset) throw new Error(`Database "${db}" already has ${existing} documents. Use --reset to replace it.`);
    if (existing) {
      await client.db(db).dropDatabase();
      log(`Dropped database "${db}".`);
    }
    for (const keys of INDEXES) await collection.createIndex(keys);
    await collection.createIndex({ 'systemHeader.currentVersion': 1, 'systemHeader.versionId': 1 }, { unique: true });
    const result = await collection.insertMany(documents, { checkKeys: false });
    log(`Inserted ${result.insertedCount} documents into mongo "${db}".`);

    const request = async (method, url, body, contentType = 'application/json') => {
      const response = await fetch(`${es}${url}`, { method, headers: { 'content-type': contentType }, body });
      const text = await response.text();
      return { status: response.status, json: text ? JSON.parse(text) : {} };
    };
    if ((await fetch(`${es}/${index}`, { method: 'HEAD' })).status === 200) {
      await request('DELETE', `/${index}`);
      log(`Deleted index "${index}".`);
    }
    const created = await request('PUT', `/${index}`, indexTemplate());
    if (created.status >= 300) throw new Error(`Creating index "${index}" failed: ${JSON.stringify(created.json)}`);

    // Like test-setup: _id is the Mongo _id, the body is the document plus `id`.
    const lines = [];
    for (const doc of documents) {
      const { _id, ...body } = doc;
      const id = _id.toHexString();
      lines.push(JSON.stringify({ index: { _index: index, _id: id } }), JSON.stringify({ ...body, id }));
    }
    const bulk = await request('POST', '/_bulk?refresh=true', `${lines.join('\n')}\n`, 'application/x-ndjson');
    const failed = (bulk.json.items ?? []).filter((item) => item.index?.error);
    for (const item of failed.slice(0, 5)) log(`  ${item.index._id}: ${item.index.error.reason}`);
    const count = await request('GET', `/${index}/_count`);
    log(`Indexed ${count.json.count} documents into elasticsearch "${index}"${failed.length ? ` (${failed.length} failed)` : ''}.`);

    if (redis) {
      await flushRedis(redis, redisDb);
      log(`Flushed redis db ${redisDb} at ${redis} (fieldtec-web's cached rules, templates and sessions).`);
    }
    return { inserted: result.insertedCount, indexed: count.json.count, failed: failed.length };
  } finally {
    await client.close();
  }
}
