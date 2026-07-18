// Waits for infra (PostgreSQL / Redis / MinIO) to accept TCP connections,
// then runs the Go API migrations + seed. Invoked by `pnpm setup`.
import net from 'node:net';
import { spawnSync } from 'node:child_process';

const targets = [
  { name: 'PostgreSQL', host: '127.0.0.1', port: 5432 },
  { name: 'Redis', host: '127.0.0.1', port: 6379 },
  { name: 'MinIO', host: '127.0.0.1', port: 9000 },
];

function probe({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    const fail = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once('timeout', fail);
    socket.once('error', fail);
  });
}

async function waitFor(target, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    if (await probe(target)) {
      console.log(`  ✓ ${target.name} is up (${target.host}:${target.port})`);
      return;
    }
    process.stdout.write(`  … waiting for ${target.name} (${i + 1}/${attempts})\r`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`${target.name} did not become ready on ${target.host}:${target.port}`);
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

console.log('Waiting for infrastructure...');
for (const t of targets) {
  await waitFor(t);
}

// The Go API auto-migrates (gormigrate) then seeds and exits.
run('pnpm', ['api:seed']);

console.log('\n✅ Setup complete. Run `pnpm api:dev` (API) and `pnpm dev` (web + game).');
