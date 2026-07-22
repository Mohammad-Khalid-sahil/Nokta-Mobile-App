import mongoose from 'mongoose';
import { consoleMonitor } from './consoleMonitor';
import { getMonitorActor } from './requestContextStore';

function formatRecordId(value: unknown) {
  if (value == null) return undefined;
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function logDatabase(
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  collection: string,
  recordId?: unknown,
  detail?: string
) {
  consoleMonitor.database({
    operation,
    collection,
    recordId: formatRecordId(recordId),
    actor: getMonitorActor(),
    detail
  });
}

/** Logs INSERT / UPDATE / DELETE operations to the terminal dashboard. */
export function installMongooseMonitor() {
  if ((mongoose as typeof mongoose & { __noktaMonitorInstalled?: boolean }).__noktaMonitorInstalled) {
    return;
  }

  mongoose.plugin((schema) => {
    const collectionName = String(schema.get('collection') ?? 'unknown');

    schema.post('save', function saveMonitor(doc) {
      const op = doc.isNew ? 'INSERT' : 'UPDATE';
      logDatabase(op, collectionName, doc._id);
    });

    schema.post('insertMany', function insertManyMonitor(docs: Array<{ _id?: unknown }>) {
      const count = Array.isArray(docs) ? docs.length : 1;
      logDatabase('INSERT', collectionName, docs?.[0]?._id, `count=${count}`);
    });

    schema.post('findOneAndUpdate', function updateMonitor(doc) {
      if (doc) {
        logDatabase('UPDATE', collectionName, doc._id);
      }
    });

    schema.post('updateOne', { document: false, query: true }, function updateOneMonitor() {
      logDatabase('UPDATE', collectionName, undefined, 'updateOne');
    });

    schema.post('updateMany', { document: false, query: true }, function updateManyMonitor() {
      logDatabase('UPDATE', collectionName, undefined, 'updateMany');
    });

    schema.post('deleteOne', { document: false, query: true }, function deleteOneMonitor() {
      logDatabase('DELETE', collectionName, undefined, 'deleteOne');
    });

    schema.post('deleteMany', { document: false, query: true }, function deleteManyMonitor() {
      logDatabase('DELETE', collectionName, undefined, 'deleteMany');
    });

    schema.post('findOneAndDelete', function deleteDocMonitor(doc) {
      if (doc) {
        logDatabase('DELETE', collectionName, doc._id);
      }
    });
  });

  (mongoose as typeof mongoose & { __noktaMonitorInstalled?: boolean }).__noktaMonitorInstalled = true;
}
