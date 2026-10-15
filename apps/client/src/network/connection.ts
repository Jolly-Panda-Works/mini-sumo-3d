import type { Room } from "colyseus.js";

/**
 * What RoomManager needs from a room. Implemented by the online Colyseus room and by the
 * offline LocalConnection, so the rest of the client doesn't care which one is running.
 */
export interface GameConnection {
  readonly roomId: string;
  readonly sessionId: string;
  /** Live state with the SyncedState shape, mutated in place. */
  readonly state: unknown;
  /** True when the room runs locally against bots (no server). */
  readonly offline: boolean;
  send(type: string, message?: unknown): void;
  onStateChange(callback: () => void): void;
  onMessage(type: string, callback: (message: any) => void): void;
  onError(callback: (code: number, message?: string) => void): void;
  onLeave(callback: (code: number) => void): void;
  removeAllListeners(): void;
  leave(consented?: boolean): Promise<unknown>;
}

export function wrapColyseusRoom(room: Room): GameConnection {
  return {
    get roomId() {
      return room.roomId;
    },
    get sessionId() {
      return room.sessionId;
    },
    get state() {
      return room.state;
    },
    offline: false,
    send: (type, message) => room.send(type, message),
    onStateChange: (callback) => {
      room.onStateChange(() => callback());
    },
    onMessage: (type, callback) => {
      room.onMessage(type, callback);
    },
    onError: (callback) => {
      room.onError((code, message) => callback(code, message));
    },
    onLeave: (callback) => {
      room.onLeave((code) => callback(code));
    },
    removeAllListeners: () => room.removeAllListeners(),
    leave: (consented) => room.leave(consented),
  };
}
