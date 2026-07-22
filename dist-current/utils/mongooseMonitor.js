"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installMongooseMonitor = installMongooseMonitor;
const mongoose_1 = __importDefault(require("mongoose"));
const consoleMonitor_1 = require("./consoleMonitor");
const requestContextStore_1 = require("./requestContextStore");
function formatRecordId(value) {
    if (value == null)
        return undefined;
    if (typeof value === 'object' && value !== null && '_id' in value) {
        return String(value._id);
    }
    return String(value);
}
function logDatabase(operation, collection, recordId, detail) {
    consoleMonitor_1.consoleMonitor.database({
        operation,
        collection,
        recordId: formatRecordId(recordId),
        actor: (0, requestContextStore_1.getMonitorActor)(),
        detail
    });
}
/** Logs INSERT / UPDATE / DELETE operations to the terminal dashboard. */
function installMongooseMonitor() {
    if (mongoose_1.default.__noktaMonitorInstalled) {
        return;
    }
    mongoose_1.default.plugin((schema) => {
        const collectionName = String(schema.get('collection') ?? 'unknown');
        schema.post('save', function saveMonitor(doc) {
            const op = doc.isNew ? 'INSERT' : 'UPDATE';
            logDatabase(op, collectionName, doc._id);
        });
        schema.post('insertMany', function insertManyMonitor(docs) {
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
    mongoose_1.default.__noktaMonitorInstalled = true;
}
