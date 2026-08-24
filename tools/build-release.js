const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const builder = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
const args = process.argv.includes('--portable-only')
  ? ['--win', 'portable']
  : ['--win', 'nsis', 'portable'];
args.push('--publish', 'never');

const localElectronDist = path.join(root, 'node_modules', 'electron', 'dist');
if (fs.existsSync(path.join(localElectronDist, process.platform === 'win32' ? 'electron.exe' : 'Electron.app'))) {
  args.push(`--config.electronDist=${localElectronDist}`);
}

const result = spawnSync(builder, args, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
