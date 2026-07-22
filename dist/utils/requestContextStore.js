"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestMonitorStore = void 0;
exports.getMonitorActor = getMonitorActor;
exports.setMonitorActor = setMonitorActor;
const node_async_hooks_1 = require("node:async_hooks");
exports.requestMonitorStore = new node_async_hooks_1.AsyncLocalStorage();
function getMonitorActor() {
    return exports.requestMonitorStore.getStore()?.actor ?? 'system';
}
function setMonitorActor(actor) {
    const store = exports.requestMonitorStore.getStore();
    if (store) {
        store.actor = actor;
    }
}
