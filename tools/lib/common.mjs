import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function version() {
  return JSON.parse(readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
}

export function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8', cwd: opts.cwd ?? ROOT, env: { ...process.env, JAVA_TOOL_OPTIONS: '' } });
}

export function which(bin) {
  try {
    return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

export function apkName(v) {
  return `Sotvorenie-v${v.version}-stage${v.stage}.apk`;
}

export const SDK = process.env.ANDROID_HOME || '/usr/lib/android-sdk';
export const ANDROID_JAR = process.env.ANDROID_JAR || path.join(SDK, 'platforms/android-23/android.jar');
export const KEYSTORE = path.join(ROOT, 'tools/signing/debug.keystore');
export const KS_PASS = 'android';
export const KS_ALIAS = 'sotvdebug';
