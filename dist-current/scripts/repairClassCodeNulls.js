"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const connect_1 = require("../database/connect");
const Class_1 = require("../models/Class");
async function generateNextClassCode() {
    const year = new Date().getFullYear();
    const prefix = `CLS-${year}-`;
    let index = await Class_1.ClassModel.countDocuments({ classCode: { $regex: `^${prefix}` } });
    index += 1;
    while (true) {
        const classCode = `CLS-${year}-${String(index).padStart(4, '0')}`;
        const exists = await Class_1.ClassModel.exists({ classCode });
        if (!exists)
            return classCode;
        index += 1;
    }
}
async function repairClassCodes() {
    await (0, connect_1.connectDatabase)();
    const invalidClasses = await Class_1.ClassModel.find({ $or: [{ classCode: null }, { classCode: '' }, { classCode: undefined }] });
    if (!invalidClasses.length) {
        console.log('No invalid classCode records found.');
        return;
    }
    for (const klass of invalidClasses) {
        const newCode = await generateNextClassCode();
        klass.classCode = newCode;
        await klass.save();
        console.log(`Updated class ${klass._id} with classCode=${newCode}`);
    }
}
repairClassCodes()
    .then(() => {
    console.log('repairClassCodeNulls completed.');
    process.exit(0);
})
    .catch((error) => {
    console.error('repairClassCodeNulls failed:', error);
    process.exit(1);
});
