"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
require("../models");
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../config/env");
async function connectDatabase() {
    await mongoose_1.default.connect(env_1.config.mongoUri, {
        serverSelectionTimeoutMS: 5000
    });
    mongoose_1.default.set('strictQuery', true);
    mongoose_1.default.connection.on('connected', () => {
        console.log(`MongoDB connected (${mongoose_1.default.connection.name})`);
    });
    mongoose_1.default.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
    });
}
async function disconnectDatabase() {
    if (mongoose_1.default.connection.readyState !== 0) {
        await mongoose_1.default.disconnect();
    }
}
