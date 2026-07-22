"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Message_1 = require("../../models/Message");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
const messageTypePath = Message_1.Message.schema.path('messageType');
assert(Boolean(messageTypePath.enumValues?.includes('public_contact')), 'Message.messageType enum must include public_contact for public contact form');
console.log('public-contact schema tests passed');
