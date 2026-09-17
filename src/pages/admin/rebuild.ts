import { spawn } from 'node:child_process';

export const prerender = false;

export async function POST({ redirect }) {
  await runBuild();
  return redirect('/admin/?rebuilt=1');
}

/**
 * 重新生成静态站点。公开页面是预渲染的，所以后台的改动需要一次构建才会出现在前台。
 * 生产环境更适合把这一步交给 CI，这里保留一条本地能跑通的路径。
 */
function runBuild(): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: process.cwd(),
      shell: true,
      windowsHide: true,
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });

    const timer = setTimeout(() => child.kill(), 180_000);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.split('\n').slice(-12).join('\n') });
    });
  });
}
