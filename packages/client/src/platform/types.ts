export type DeviceClass = 'low' | 'mid' | 'high';

export interface Platform {
  readonly name: 'web' | 'android';
  storageGet(key: string): Promise<Uint8Array | null>;
  storageSet(key: string, data: Uint8Array): Promise<void>;
  storageDelete(key: string): Promise<void>;
  storageKeys(prefix: string): Promise<string[]>;
  exportFile(name: string, data: Uint8Array, mime: string): Promise<boolean>;
  importFile(accept: string): Promise<Uint8Array | null>;
  share(title: string, text: string): Promise<boolean>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): boolean;
  vibrate(ms: number): void;
  onBack(handler: () => boolean): void;
  onPause(handler: () => void): void;
  onResume(handler: () => void): void;
  deviceClass(): DeviceClass;
  isTouch(): boolean;
  exitApp(): void;
}
