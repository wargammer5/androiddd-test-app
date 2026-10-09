import type { Platform } from './types.ts';
import { createWebPlatform } from './web.ts';
import { createAndroidPlatform, hasAndroidBridge } from './android.ts';

export type { Platform, DeviceClass } from './types.ts';

export const platform: Platform = hasAndroidBridge() ? createAndroidPlatform() : createWebPlatform();
