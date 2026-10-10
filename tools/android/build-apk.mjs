import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync, statSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, run, version, which, apkName, ANDROID_JAR, KEYSTORE, KS_PASS, KS_ALIAS, RELEASE_KEYSTORE, RELEASE_PASS, RELEASE_ALIAS } from '../lib/common.mjs';
import { encodePng, drawIcon } from '../lib/png.mjs';

const args = process.argv.slice(2);
const skipWeb = args.includes('--skip-web');
const release = args.includes('--release');
const aab = args.includes('--aab');
const v = version();
const versionCode = v.stage * 100 + Number(v.version.split('.').pop() || 0) + 1;

const missing = ['aapt2', 'javac', 'zipalign', 'apksigner', 'dalvik-exchange', 'zip', 'keytool'].filter((b) => !which(b));
if (missing.length || !existsSync(ANDROID_JAR)) {
  console.error('Missing tools: ' + missing.join(', ') + (existsSync(ANDROID_JAR) ? '' : ' android.jar'));
  console.error('Install: apt-get install android-sdk android-sdk-platform-23 dalvik-exchange zip');
  process.exit(2);
}

if (!skipWeb) run('pnpm', ['build:web']);
const webDist = path.join(ROOT, 'packages/client/dist');
if (!existsSync(path.join(webDist, 'index.html'))) throw new Error('web build missing');

if (!existsSync(KEYSTORE)) {
  mkdirSync(path.dirname(KEYSTORE), { recursive: true });
  run('keytool', ['-genkeypair', '-keystore', KEYSTORE, '-storepass', KS_PASS, '-keypass', KS_PASS, '-alias', KS_ALIAS, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Sotvorenie Debug, O=Sotvorenie, C=RU']);
}

const app = path.join(ROOT, 'apps/android');
const work = path.join(ROOT, 'tools/android/.work');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const res = path.join(work, 'res');
cpSync(path.join(app, 'res'), res, { recursive: true });
for (const [dir, size] of [['mipmap-mdpi', 48], ['mipmap-hdpi', 72], ['mipmap-xhdpi', 96], ['mipmap-xxhdpi', 144], ['mipmap-xxxhdpi', 192]]) {
  mkdirSync(path.join(res, dir), { recursive: true });
  writeFileSync(path.join(res, dir, 'ic_launcher.png'), encodePng(size, size, drawIcon(size)));
}
const manifest = readFileSync(path.join(app, 'AndroidManifest.xml'), 'utf8').replace('@VERSION_CODE@', String(versionCode)).replace('@VERSION_NAME@', release ? v.version : `${v.version}-stage${v.stage}`);
writeFileSync(path.join(work, 'AndroidManifest.xml'), manifest);

const assets = path.join(work, 'assets');
cpSync(webDist, path.join(assets, 'web'), { recursive: true });

run('aapt2', ['compile', '--dir', res, '-o', path.join(work, 'res.zip')]);
run('aapt2', ['link', '-I', ANDROID_JAR, '--manifest', path.join(work, 'AndroidManifest.xml'), '-A', assets, '-o', path.join(work, 'base.apk'), path.join(work, 'res.zip'), '--auto-add-overlay', '-0', 'ogg', '-0', 'png']);

const classes = path.join(work, 'classes');
mkdirSync(classes);
const srcs = [];
const walk = (d) => {
  for (const f of readdirSyncSafe(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.java')) srcs.push(p);
  }
};
function readdirSyncSafe(d) {
  return existsSync(d) ? readdirSync(d) : [];
}
import { readdirSync } from 'node:fs';
walk(path.join(app, 'src'));
run('javac', ['-nowarn', '-Xlint:-options', '-source', '8', '-target', '8', '-encoding', 'UTF-8', '-bootclasspath', ANDROID_JAR, '-d', classes, ...srcs]);
run('dalvik-exchange', ['--dex', '--min-sdk-version=24', `--output=${path.join(work, 'classes.dex')}`, classes]);

const unaligned = path.join(work, 'unaligned.apk');
copyFileSync(path.join(work, 'base.apk'), unaligned);
run('zip', ['-q', '-j', unaligned, path.join(work, 'classes.dex')]);
const aligned = path.join(work, 'aligned.apk');
run('zipalign', ['-f', '-p', '4', unaligned, aligned]);

const outDir = path.join(ROOT, 'out');
mkdirSync(outDir, { recursive: true });
if (release && !existsSync(RELEASE_KEYSTORE)) {
  mkdirSync(path.dirname(RELEASE_KEYSTORE), { recursive: true });
  run('keytool', ['-genkeypair', '-keystore', RELEASE_KEYSTORE, '-storepass', RELEASE_PASS, '-keypass', RELEASE_PASS, '-alias', RELEASE_ALIAS, '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-dname', 'CN=Sotvorenie, O=Sotvorenie, C=RU']);
}
const outApk = path.join(outDir, release ? `Sotvorenie-v${v.version}-release.apk` : apkName(v));
const ks = release ? ['--ks', RELEASE_KEYSTORE, '--ks-pass', `pass:${RELEASE_PASS}`, '--ks-key-alias', RELEASE_ALIAS] : ['--ks', KEYSTORE, '--ks-pass', `pass:${KS_PASS}`, '--ks-key-alias', KS_ALIAS];
run('apksigner', ['sign', ...ks, '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--out', outApk, aligned]);
rmSync(outApk + '.idsig', { force: true });
console.log(`APK: ${outApk} (${(statSync(outApk).size / 1048576).toFixed(2)} MB, versionCode ${versionCode})`);

if (aab) {
  const proto = path.join(work, 'proto.apk');
  run('aapt2', ['link', '--proto-format', '-I', ANDROID_JAR, '--manifest', path.join(work, 'AndroidManifest.xml'), '-A', assets, '-o', proto, path.join(work, 'res.zip'), '--auto-add-overlay']);
  const bdir = path.join(work, 'bundle');
  const base = path.join(bdir, 'base');
  rmSync(bdir, { recursive: true, force: true });
  mkdirSync(path.join(base, 'manifest'), { recursive: true });
  mkdirSync(path.join(base, 'dex'), { recursive: true });
  run('unzip', ['-q', proto, '-d', path.join(work, 'proto')]);
  const pd = path.join(work, 'proto');
  copyFileSync(path.join(pd, 'AndroidManifest.xml'), path.join(base, 'manifest', 'AndroidManifest.xml'));
  copyFileSync(path.join(pd, 'resources.pb'), path.join(base, 'resources.pb'));
  cpSync(path.join(pd, 'res'), path.join(base, 'res'), { recursive: true });
  if (existsSync(path.join(pd, 'assets'))) cpSync(path.join(pd, 'assets'), path.join(base, 'assets'), { recursive: true });
  copyFileSync(path.join(work, 'classes.dex'), path.join(base, 'dex', 'classes.dex'));
  const ver = Buffer.from('1.15.6', 'utf8');
  const inner = Buffer.concat([Buffer.from([0x12, ver.length]), ver]);
  writeFileSync(path.join(bdir, 'BundleConfig.pb'), Buffer.concat([Buffer.from([0x0a, inner.length]), inner]));
  const outAab = path.join(outDir, `Sotvorenie-v${v.version}.aab`);
  rmSync(outAab, { force: true });
  run('zip', ['-q', '-r', '-X', outAab, 'BundleConfig.pb', 'base'], { cwd: bdir });
  if (!existsSync(RELEASE_KEYSTORE)) throw new Error('release keystore missing');
  run('jarsigner', ['-keystore', RELEASE_KEYSTORE, '-storepass', RELEASE_PASS, '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', outAab, RELEASE_ALIAS]);
  console.log(`AAB: ${outAab} (${(statSync(outAab).size / 1048576).toFixed(2)} MB)`);
}
