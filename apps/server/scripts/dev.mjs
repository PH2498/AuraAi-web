import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(serverRoot, 'package.json'));
const tscJs = require.resolve('typescript/lib/tsc.js');

const tsc = spawn(
  process.execPath,
  [tscJs, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
  { cwd: serverRoot, stdio: ['inherit', 'pipe', 'pipe'] },
);

let server;
let restarting = false;

function startServer() {
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: serverRoot,
    stdio: 'inherit',
  });
  server.on('exit', (code, signal) => {
    if (!restarting && signal !== 'SIGTERM' && code && code !== 0) {
      console.error(`server exited with code ${code}`);
    }
  });
}

function restartServer() {
  if (!server || server.exitCode !== null) {
    startServer();
    return;
  }
  restarting = true;
  server.once('exit', () => {
    restarting = false;
    startServer();
  });
  server.kill('SIGTERM');
}

function watchCompiler(stream, output) {
  let buffer = '';
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    output.write(text);
    buffer = (buffer + text.replace(/\u001b\[[0-9;]*m/g, '')).slice(-4000);
    if (buffer.includes('Found 0 errors')) {
      buffer = '';
      restartServer();
    }
  });
}

watchCompiler(tsc.stdout, process.stdout);
watchCompiler(tsc.stderr, process.stderr);

function shutdown() {
  if (server && server.exitCode === null) server.kill('SIGTERM');
  if (tsc.exitCode === null) tsc.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

tsc.on('exit', (code) => {
  if (server && server.exitCode === null) server.kill('SIGTERM');
  process.exit(code ?? 1);
});
