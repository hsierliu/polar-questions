/**
 * Local-only helper for generating a server-side Dropbox refresh token.
 */

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import readline from "node:readline";
import { Writable } from "node:stream";

let muteTerminal = false;
const promptOutput = new Writable({
  write(chunk, _encoding, callback) {
    if (!muteTerminal) process.stdout.write(chunk);
    callback();
  },
});
const rl = readline.createInterface({
  input: process.stdin,
  output: promptOutput,
  terminal: true,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askSecret(question) {
  process.stdout.write(question);
  muteTerminal = true;
  return new Promise((resolve) => {
    rl.question("", (answer) => {
      muteTerminal = false;
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const appKey = (await ask("Enter your Dropbox App Key: ")).trim();
  const appSecret = (await askSecret("Enter your Dropbox App Secret: ")).trim();
  if (!appKey || !appSecret) throw new Error("App Key and App Secret are required");

  const port = 3000;
  const state = randomBytes(32).toString("hex");
  const redirectUri = `http://localhost:${port}/oauth-callback`;
  let resolveCode;
  const codePromise = new Promise((resolve) => {
    resolveCode = resolve;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (
      url.pathname !== "/oauth-callback" ||
      url.searchParams.get("state") !== state ||
      !url.searchParams.get("code")
    ) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Authorization failed. Invalid callback.");
      return;
    }
    resolveCode(url.searchParams.get("code"));
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Authorization succeeded. Return to the terminal.");
    server.close();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const params = new URLSearchParams({
    client_id: appKey,
    response_type: "code",
    token_access_type: "offline",
    redirect_uri: redirectUri,
    state,
  });
  console.log("\nOpen this URL in your browser:\n");
  console.log(`https://www.dropbox.com/oauth2/authorize?${params}\n`);

  const code = await codePromise;
  const response = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: appKey,
      client_secret: appSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) throw new Error("Dropbox rejected the authorization code");

  const data = await response.json();
  console.log("\nAdd these as sensitive, server-only Vercel variables:\n");
  console.log(`DROPBOX_APP_KEY=${appKey}`);
  console.log(`DROPBOX_APP_SECRET=${appSecret}`);
  console.log(`DROPBOX_REFRESH_TOKEN=${data.refresh_token}`);
  console.log("\nNever use a VITE_ prefix for these values.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
