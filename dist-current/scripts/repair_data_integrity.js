"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const connect_1 = require("../database/connect");
const dataIntegrityService_1 = require("../services/dataIntegrityService");
async function main() {
    const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
    try {
        await (0, connect_1.connectDatabase)();
        const service = new dataIntegrityService_1.DataIntegrityService();
        const summary = await service.repair(mode);
        console.log(JSON.stringify(summary, null, 2));
    }
    catch (error) {
        console.error('Data integrity repair failed:', error);
        process.exitCode = 1;
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
main();
