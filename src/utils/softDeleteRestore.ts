export async function restoreSoftDeletedRecord(model: { findOneAndUpdate: Function }, id: string) {
  return model.findOneAndUpdate(
    { _id: id },
    { isDeleted: false, deletedAt: null, deletedBy: null },
    { new: true }
  ).lean();
}
