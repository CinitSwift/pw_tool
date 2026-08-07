import { useSyncExternalStore } from 'react';
import type { PwToolApi } from '../preload/api';
import { getRuntimeSnapshot } from '../shared/domain/runtime-snapshot';
import type { SessionSnapshot } from '../shared/domain/types';

export type RendererState =
  | { status: 'loading'; snapshot: null; message: string }
  | { status: 'ready'; snapshot: SessionSnapshot; message: null }
  | { status: 'error'; snapshot: null; message: string };

export interface RendererStore {
  getState(): RendererState;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  acceptSnapshot(snapshot: SessionSnapshot): void;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '无法加载当前计时状态，请稍后重试。';
}

export function createRendererStore(api: PwToolApi, clock: () => number = Date.now): RendererStore {
  let state: RendererState = { status: 'loading', snapshot: null, message: '正在加载计时状态' };
  const listeners = new Set<() => void>();

  const emit = (): void => listeners.forEach((listener) => listener());
  const acceptSnapshot = (snapshot: SessionSnapshot): void => {
    state = { status: 'ready', snapshot: { ...snapshot, runtime: { ...snapshot.runtime } }, message: null };
    emit();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    acceptSnapshot,
    start() {
      let stopped = false;
      const unsubscribe = api.session.subscribe((snapshot) => {
        if (!stopped) acceptSnapshot(snapshot);
      });
      const interval = window.setInterval(() => {
        if (state.status !== 'ready' || state.snapshot.session?.status !== 'running') return;
        const snapshot = state.snapshot;
        state = {
          status: 'ready',
          snapshot: { ...snapshot, runtime: getRuntimeSnapshot(snapshot.session, clock()) },
          message: null,
        };
        emit();
      }, 1_000);

      void api.session.getSnapshot().then((snapshot) => {
        if (!stopped) acceptSnapshot(snapshot);
      }).catch((error: unknown) => {
        if (stopped) return;
        state = { status: 'error', snapshot: null, message: errorMessage(error) };
        emit();
      });

      return () => {
        stopped = true;
        window.clearInterval(interval);
        unsubscribe();
      };
    },
  };
}

export function useRendererState(store: RendererStore): RendererState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
