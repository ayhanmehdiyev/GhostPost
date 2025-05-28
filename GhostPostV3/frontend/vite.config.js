import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import FormData from 'form-data';

// determine current file and directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// export the Vite configuration object
export default defineConfig({
  plugins: [
    react(), // enable JSX and fast refresh amongst other things
    {
      // this is my custom plugin to be able to generate the risc0 proof through the client
      name: 'zk-prover-middleware', // custom name hehe
      configureServer(server) {
        // hook into Vite's dev server middleware stack
        server.middlewares.use((req, res, next) => {
          // only intercept POST requests to '/zk-prove' because that's all that we care about
          if (req.url === '/zk-prove' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => (body += chunk));
            req.on('end', async () => {
              const tmpDir = path.resolve(__dirname, '../zk-simple/tmp_proof');
              try {
                // parse + sanitize client state
                const parsed = JSON.parse(body);
                const zkState = {
                  existing_tickets: Array.isArray(parsed.existing_tickets)
                    ? parsed.existing_tickets.map(String)
                    : [],
                  callback_tickets: Array.isArray(parsed.callback_tickets)
                    ? parsed.callback_tickets.map(String)
                    : [],
                  is_banned: Boolean(parsed.is_banned),
                  old_nonce: String(parsed.old_nonce ?? '0'),
                };

                // prepare temp workspace
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
                fs.mkdirSync(tmpDir);

                // write prover input
                fs.writeFileSync(
                  path.join(tmpDir, 'req.json'),
                  JSON.stringify(zkState)
                );

                // run the prover
                const proverPath = path.resolve(__dirname, '../zk-simple/target/release/prove');
                await new Promise((resolve, reject) => {
                  let stderr = '';
                  const p = spawn(
                    proverPath,
                    ['--proof-input', 'req.json', '--receipt', 'receipt.bin'],
                    { cwd: tmpDir, env: { ...process.env, RISC0_DEV_MODE: '1' } }
                  );
                  p.stderr.on('data', d => { stderr += d.toString(); });
                  p.on('error', reject);
                  p.on('exit', code => {
                    if (code === 0) resolve();
                    else if (stderr.includes('BANNED:')) reject({ banned: true });
                    else reject(new Error(`prover failed with code ${code}`));
                  });
                });

                // submit the raw receipt to your FastAPI for verification
                const form = new FormData();
                form.append(
                  'receipt',
                  fs.createReadStream(path.join(tmpDir, 'receipt.bin')),
                  'receipt.bin'
                );
                const backendRes = await axios.post(
                  'http://localhost:8000/submit-proof',
                  form,
                  { headers: form.getHeaders() }
                );

                // forward the server’s JSON reply (journal) to the client
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(backendRes.data));

              } catch (e) {
                if (e.banned) {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({
                    detail: 'banned',
                    message: '🚫 You have been banned – you cannot post again!',
                  }));
                }
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              } finally {
                // cleanup
                if (fs.existsSync(tmpDir)) {
                  fs.rmSync(tmpDir, { recursive: true, force: true });
                }
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ],
  server: { port: 5173 } // this is the server port my DEV is running on, i hope this doesn't change
});
