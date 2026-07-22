"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const env_1 = require("../config/env");
function buildInvoiceNumber() {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const entropy = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    return `INV-${stamp}-${entropy}`;
}
async function generateUniqueInvoice() {
    for (let i = 0; i < 10; i += 1) {
        const candidate = buildInvoiceNumber();
        const exists = await Payment_1.Payment.findOne({ invoiceNumber: candidate }).select('_id').lean();
        if (!exists)
            return candidate;
    }
    throw new Error('Unable to generate unique invoice number');
}
async function run() {
    await mongoose_1.default.connect(env_1.config.mongoUri);
    const broken = await Payment_1.Payment.find({
        $or: [{ invoiceNumber: { $exists: false } }, { invoiceNumber: null }, { invoiceNumber: '' }]
    }).select('_id').lean();
    for (const payment of broken) {
        const invoiceNumber = await generateUniqueInvoice();
        await Payment_1.Payment.updateOne({ _id: payment._id }, { $set: { invoiceNumber } });
    }
    await Payment_1.Payment.collection.dropIndex('invoiceNumber_1').catch(() => undefined);
    await Payment_1.Payment.collection.createIndex({ invoiceNumber: 1 }, { unique: true, name: 'invoiceNumber_1' });
    console.log(`Updated ${broken.length} payments with invoice numbers.`);
    await mongoose_1.default.disconnect();
}
run().catch(async (error) => {
    console.error(error);
    await mongoose_1.default.disconnect();
    process.exit(1);
});
