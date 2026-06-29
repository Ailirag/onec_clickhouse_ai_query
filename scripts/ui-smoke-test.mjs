import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.UI_SMOKE_APP_PORT || 3100);
const chromePort = Number(process.env.UI_SMOKE_CHROME_PORT || 9223);
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = path.join(os.tmpdir(), `onec-clickhouse-ui-${Date.now()}`);
const externalProcesses = process.env.UI_SMOKE_EXTERNAL === "1" || process.argv.includes("--external");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, timeoutMs = 15000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function cdpCall(ws, id, method, params = {}) {
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`Timed out waiting for CDP method ${method}`));
    }, 60000);
    const onMessage = (data) => {
      const message = JSON.parse(data.toString());
      if (message.id !== id) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    };
    ws.on("message", onMessage);
  });
}

async function main() {
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome not found at ${chromePath}`);
  }

  if (!externalProcesses) {
    process.env.PORT = String(port);
    process.env.NODE_ENV = "production";
    await import(pathToFileURL(path.join(root, "dist", "server.cjs")).href);
  }

  const chrome = externalProcesses ? null : spawn(chromePath, [
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-default-apps",
    "--headless=new",
    `http://127.0.0.1:${port}`
  ], {
    stdio: "ignore",
    windowsHide: true
  });
  chrome?.once("error", (error) => {
    console.error(`failed to start chrome: ${error.message}`);
  });

  try {
    console.log("waiting for app");
    await waitFor(`http://127.0.0.1:${port}`);
    console.log("waiting for chrome");
    await waitFor(`http://127.0.0.1:${chromePort}/json/version`);

    const tabs = await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json();
    const tab = tabs.find((item) => item.url.startsWith(`http://127.0.0.1:${port}`)) || tabs[0];
    const { default: WebSocket } = await import("ws");
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    let id = 1;
    const call = (method, params) => cdpCall(ws, id++, method, params);
    await call("Runtime.enable");
    await call("Page.enable");
    console.log("navigating page");
    await call("Page.navigate", { url: `http://127.0.0.1:${port}` });
    await wait(1000);
    const pageState = await call("Runtime.evaluate", {
      returnByValue: true,
      expression: `({ href: location.href, title: document.title, text: document.body.innerText.slice(0, 200) })`
    });
    console.log(JSON.stringify(pageState.result.value));

    console.log("running ui scenario");
    const result = await call("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `
        Promise.race([
        (async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const waitFor = async (selector, timeout = 10000) => {
            const started = Date.now();
            while (Date.now() - started < timeout) {
              const el = document.querySelector(selector);
              if (el) return el;
              await sleep(100);
            }
            throw new Error("Element not found: " + selector);
          };
          const setValue = (selector, value) => {
            const el = document.querySelector(selector);
            if (!el) throw new Error("Element not found: " + selector);
            const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
            setter.call(el, value);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          };
          const clickByText = (text) => {
            const el = [...document.querySelectorAll("button")].find((button) => button.innerText.includes(text));
            if (!el) throw new Error("Button not found: " + text);
            el.click();
          };
          await waitFor("#login-container");
          setValue("#login-username", "admin");
          setValue("#login-password", "admin");
          clickByText("Войти");
          await Promise.race([
            waitFor("#ai-query-interface", 10000),
            (async () => {
              await waitFor("#login-error", 10000);
              throw new Error(document.querySelector("#login-error").innerText);
            })()
          ]);

          await waitFor("#db-schema-browser");
          await waitFor("#settings-toggle");
          if (document.querySelector("#clickhouse-connector")) {
            throw new Error("Connection settings should be collapsed by default");
          }

          const analyticsToggle = await waitFor("#analytics-toggle");
          if (analyticsToggle.checked) throw new Error("Analytics should be disabled by default");
          if (document.querySelector("#analytics-dashboard")) throw new Error("Analytics dashboard should be hidden while analytics is off");
          analyticsToggle.click();
          await sleep(150);
          if (localStorage.getItem("analytics_enabled") !== "true") throw new Error("Analytics toggle did not persist enabled state");
          analyticsToggle.click();
          await sleep(150);
          if (localStorage.getItem("analytics_enabled") !== "false") throw new Error("Analytics toggle did not persist disabled state");

          document.querySelector("#settings-toggle").click();
          await waitFor("#ai-config-panel");
          setValue("#global-system-prompt-input", "Smoke test system prompt");
          await sleep(300);
          const aiConfig = JSON.parse(localStorage.getItem("ai_config") || "{}");
          if (aiConfig.systemPrompt !== "Smoke test system prompt") {
            throw new Error("Global system prompt was not saved to ai_config");
          }

          setValue("#database-combobox", "default");
          document.querySelector("#database-apply-btn").click();
          await waitFor("#ai-dialog-messages");
          await sleep(150);
          const bubbles = [...document.querySelectorAll("#ai-dialog-messages > div")].map((node) => {
            const rect = node.querySelector("div").getBoundingClientRect();
            return { text: node.innerText, left: rect.left, right: rect.right };
          });
          const userBubble = bubbles.find((bubble) => bubble.text.includes("Использовать базу default"));
          const assistantBubble = bubbles.find((bubble) => bubble.text.includes("Контекст базы зафиксирован"));
          if (!userBubble || !assistantBubble) throw new Error("Database dialog messages were not rendered");
          if (userBubble.left <= assistantBubble.left) {
            throw new Error("User message should be aligned to the right of assistant message");
          }

          return {
            title: document.title,
            settingsCollapsedInitially: true,
            analyticsDefault: "off",
            systemPrompt: aiConfig.systemPrompt,
            userMessageLeft: Math.round(userBubble.left),
            assistantMessageLeft: Math.round(assistantBubble.left)
          };
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("UI scenario timeout")), 30000))
        ])
      `
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    console.log(JSON.stringify(result.result.value));

    ws.close();
  } finally {
    chrome?.kill();
  }
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
