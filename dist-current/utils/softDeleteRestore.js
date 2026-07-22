"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreSoftDeletedRecord = restoreSoftDeletedRecord;
async function restoreSoftDeletedRecord(model, id) {
    return model.findOneAndUpdate({ _id: id }, { isDeleted: false, deletedAt: null, deletedBy: null }, { new: true }).lean();
}
