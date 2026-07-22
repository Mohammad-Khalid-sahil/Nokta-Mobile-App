import mongoose from 'mongoose';
import { connectDatabase } from '../database/connect';
import { DataIntegrityService } from '../services/dataIntegrityService';

async function main() {
  const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
  try {
    await connectDatabase();
    const service = new DataIntegrityService();
    const summary = await service.repair(mode);

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('Data integrity repair failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
