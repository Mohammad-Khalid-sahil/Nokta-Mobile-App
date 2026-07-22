import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { config } from '../config/env';

function buildInvoiceNumber() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const entropy = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `INV-${stamp}-${entropy}`;
}

async function generateUniqueInvoice() {
  for (let i = 0; i < 10; i += 1) {
    const candidate = buildInvoiceNumber();
    const exists = await Payment.findOne({ invoiceNumber: candidate }).select('_id').lean();
    if (!exists) return candidate;
  }
  throw new Error('Unable to generate unique invoice number');
}

async function run() {
  await mongoose.connect(config.mongoUri);

  const broken = await Payment.find({
    $or: [{ invoiceNumber: { $exists: false } }, { invoiceNumber: null }, { invoiceNumber: '' }]
  }).select('_id').lean();

  for (const payment of broken) {
    const invoiceNumber = await generateUniqueInvoice();
    await Payment.updateOne({ _id: payment._id }, { $set: { invoiceNumber } });
  }

  await Payment.collection.dropIndex('invoiceNumber_1').catch(() => undefined);
  await Payment.collection.createIndex({ invoiceNumber: 1 }, { unique: true, name: 'invoiceNumber_1' });

  console.log(`Updated ${broken.length} payments with invoice numbers.`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
