import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(patch: Partial<T>): void;
  subscribe(listener: () => void): () => void;
}

/** Tiny external store; React components subscribe with useStore(). */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    get: () => state,
    set(next) {
      if (next === state) return;
      state = next;
      emit();
    },
    update(patch) {
      state = { ...state, ...patch };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
