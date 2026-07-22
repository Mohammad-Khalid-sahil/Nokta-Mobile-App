import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestMonitorContext {
  clientIp: string;
  actor?: string;
}

export const requestMonitorStore = new AsyncLocalStorage<RequestMonitorContext>();

export function getMonitorActor(): string {
  return requestMonitorStore.getStore()?.actor ?? 'system';
}

export function setMonitorActor(actor: string) {
  const store = requestMonitorStore.getStore();
  if (store) {
    store.actor = actor;
  }
}
