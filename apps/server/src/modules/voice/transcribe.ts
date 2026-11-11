import { type ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const WORKER = `
import sys
protocol = sys.stdout
sys.stdout = sys.stderr
import whisper
model = whisper.load_model("base", device="cpu")
protocol.write("READY\\n")
protocol.flush()
for line in sys.stdin:
    path = line.strip()
    if not path:
        continue
    try:
        result = model.transcribe(path, language="zh", fp16=False, verbose=None, initial_prompt="以下是普通话的句子。")
        text = " ".join((result.get("text") or "").split())
    except Exception:
        text = ""
    protocol.write(text + "\\n")
    protocol.flush()
`;

const JUNK = /谢谢观看|感谢观看|感谢收听|字幕|点赞|订阅|明镜|请不吝|by bilibili/i;

export function usableTranscript(text: string): string {
  const spoken = text.replace(/\s+/g, ' ').trim();
  if (!spoken) return '';
  if (spoken.length <= 24 && JUNK.test(spoken)) return '';
  return spoken;
}

function which(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [command], (error, stdout) => {
      resolve(error ? null : stdout.trim() || null);
    });
  });
}

export async function whisperPython(): Promise<string | null> {
  const bin = await which('whisper');
  if (!bin) return null;
  return join(dirname(bin), 'python3');
}

type Worker = {
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  push: (file: string) => Promise<string>;
};

let worker: Worker | null = null;

function certificateBundle(python: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(python, ['-c', 'import certifi; print(certifi.where())'], (error, stdout) => {
      resolve(error ? null : stdout.trim() || null);
    });
  });
}

async function startWorker(python: string): Promise<Worker> {
  const cert = await certificateBundle(python);
  const env = { ...process.env };
  if (cert) {
    env.SSL_CERT_FILE = cert;
    env.REQUESTS_CA_BUNDLE = cert;
    env.CURL_CA_BUNDLE = cert;
  }
  const child = spawn(python, ['-u', '-c', WORKER], { stdio: ['pipe', 'pipe', 'pipe'], env });
  child.stderr.on('data', () => undefined);
  const pending: Array<(text: string) => void> = [];
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('语音模型没有准备好')), 180_000);
    markReady = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('语音模型没有准备好'));
    });
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (line === 'READY') {
      markReady();
      return;
    }
    pending.shift()?.(line);
  });
  child.on('exit', () => {
    if (worker?.child === child) worker = null;
    while (pending.length) pending.shift()?.('');
  });
  return {
    child,
    ready,
    push(file: string) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = pending.indexOf(done);
          if (index >= 0) pending.splice(index, 1);
          reject(new Error('这句话转写超时'));
        }, 90_000);
        const done = (text: string) => {
          clearTimeout(timer);
          resolve(text);
        };
        pending.push(done);
        child.stdin.write(`${file}\n`);
      });
    },
  };
}

async function engine(): Promise<Worker> {
  if (worker && worker.child.exitCode == null) {
    await worker.ready;
    return worker;
  }
  const python = await whisperPython();
  if (!python) throw new Error('本机没有语音识别程序');
  const next = await startWorker(python);
  worker = next;
  try {
    await next.ready;
  } catch (error) {
    if (worker === next) worker = null;
    next.child.kill();
    throw error;
  }
  return next;
}

let tail: Promise<unknown> = Promise.resolve();

export function transcribeBuffer(bytes: Buffer, extension: string): Promise<string> {
  const job = tail.then(() => transcribeOnce(bytes, extension));
  tail = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

async function transcribeOnce(bytes: Buffer, extension: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'aura-voice-'));
  const file = join(dir, `clip.${extension}`);
  try {
    await writeFile(file, bytes);
    const current = await engine();
    const text = await Promise.race([
      current.push(file),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('这句话转写超时')), 90_000)),
    ]);
    return usableTranscript(text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
