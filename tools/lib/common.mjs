import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

const JAR_CANDIDATES = [process.env.ANDROID_JAR, ...[process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, '/usr/lib/android-sdk'].filter(Boolean).map((sdk) => path.join(sdk, 'platforms/android-23/android.jar'))].filter(Boolean);
export const ANDROID_JAR = JAR_CANDIDATES.find((p) => existsSync(p)) ?? JAR_CANDIDATES[JAR_CANDIDATES.length - 1];
export const KEYSTORE = path.join(ROOT, 'tools/signing/debug.keystore');
export const KS_PASS = 'android';
export const KS_ALIAS = 'sotvdebug';
export const RELEASE_KEYSTORE = process.env.SOTV_RELEASE_KEYSTORE || path.join(ROOT, 'tools/signing/release.keystore');
export const RELEASE_PASS = process.env.SOTV_RELEASE_PASS || 'sotvorenie-release';
export const RELEASE_ALIAS = 'sotvrelease';
