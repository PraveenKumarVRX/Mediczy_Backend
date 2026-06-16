import puppeteer from "puppeteer";

const BASE_URL = "http://localhost:9443";
const EMAIL = "parinitha@mysmarthealth.in";
const PASSWORD = "Mayden@321";
const SCREENSHOT = "/tmp/team-copilot-ninjacart.png";
const USER_DATA_DIR = `/tmp/chromium-team-smoke-${Date.now()}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickButtonByText(page, expectedText) {
  const buttons = await page.$$("button");
  for (const button of buttons) {
    const text = await page.evaluate((el) => (el.textContent || "").replace(/\s+/g, " ").trim(), button);
    if (text === expectedText || text.includes(expectedText)) {
      await button.click();
      return true;
    }
  }
  return false;
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium-browser",
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-web-security", `--user-data-dir=${USER_DATA_DIR}`],
  defaultViewport: { width: 1440, height: 1800 },
});

const page = await browser.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(45000);

const consoleMessages = [];
const failedRequests = [];
const responses = [];

page.on("console", (msg) => consoleMessages.push(`[console:${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleMessages.push(`[pageerror] ${err.message}`));
page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || "unknown"}`));
page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/team/login") || url.includes("/api/team/ai/generate") || url.includes("activation-stats")) {
    responses.push(`${res.status()} ${url}`);
  }
});

try {
  console.log(`Navigating to ${BASE_URL}/team/login`);
  await page.goto(`${BASE_URL}/team/login`, { waitUntil: "networkidle2" });
  await sleep(1500);

  if (page.url().includes("/team/login")) {
    await page.waitForSelector("input[name=email]", { timeout: 10000 });
    await page.type("input[name=email]", EMAIL, { delay: 15 });
    await page.type("input[name=password]", PASSWORD, { delay: 15 });
    await page.click("button[type=submit]");
    await page.waitForFunction(() => !!localStorage.getItem("teamToken"), { timeout: 30000 });
    await sleep(2500);
  }

  console.log(`Current URL before corporate management: ${page.url()}`);
  console.log(`Navigating to ${BASE_URL}/team/corporate-management`);
  await page.goto(`${BASE_URL}/team/corporate-management`, { waitUntil: "networkidle2" });
  await sleep(5000);

  const openedEmployeesTab = await clickButtonByText(page, "Employees");
  console.log(`OPENED_EMPLOYEES_TAB=${openedEmployeesTab}`);
  if (!openedEmployeesTab) {
    throw new Error("Employees tab not found");
  }
  await sleep(3000);

  const bodyText = await page.evaluate(() => document.body.innerText || "");
  console.log(`BODY_HAS_ACTIVATION=${bodyText.includes("App Activation Funnel")}`);
  console.log(`BODY_HAS_COPILOT=${bodyText.includes("Admin Copilot Chat")}`);
  console.log(`BODY_HAS_NINJACART=${bodyText.includes("Ninjacart")}`);

  await page.waitForFunction(() => document.body.innerText.includes("App Activation Funnel"), { timeout: 45000 });
  await page.waitForFunction(() => document.body.innerText.includes("Admin Copilot Chat"), { timeout: 45000 });

  const messageSelector = "div.whitespace-pre-wrap.break-words";
  const beforeCount = await page.$$eval(messageSelector, (nodes) => nodes.length);
  const textareaSelector = "textarea";
  await page.waitForSelector(textareaSelector);
  await page.click(textareaSelector);
  await page.type(textareaSelector, "Summarize the activation bottlenecks and give me the next 3 actions.", { delay: 10 });

  const sendClicked = await clickButtonByText(page, "Send");
  if (!sendClicked) throw new Error("Send button not found in Admin Copilot Chat");

  await page.waitForFunction(
    (selector, initialCount) => document.querySelectorAll(selector).length >= initialCount + 2,
    { timeout: 45000 },
    messageSelector,
    beforeCount,
  );

  const chatTranscript = await page.evaluate((selector) => {
    return Array.from(document.querySelectorAll(selector))
      .map((node) => (node.textContent || "").trim())
      .filter(Boolean)
      .slice(-4);
  }, messageSelector);

  await page.screenshot({ path: SCREENSHOT, fullPage: true });

  console.log("SMOKE_RESULT=PASS");
  console.log(`FINAL_URL=${page.url()}`);
  console.log(`CHAT_TRANSCRIPT=${JSON.stringify(chatTranscript)}`);
  console.log(`RESPONSES=${JSON.stringify(responses)}`);
  console.log(`FAILED_REQUESTS=${JSON.stringify(failedRequests)}`);
  console.log(`SCREENSHOT=${SCREENSHOT}`);
} catch (error) {
  console.log("SMOKE_RESULT=FAIL");
  console.log(`FINAL_URL=${page.url()}`);
  console.log(`RESPONSES=${JSON.stringify(responses)}`);
  console.log(`FAILED_REQUESTS=${JSON.stringify(failedRequests)}`);
  console.log(`CONSOLE_MESSAGES=${JSON.stringify(consoleMessages.slice(-120))}`);
  try {
    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    console.log(`SCREENSHOT=${SCREENSHOT}`);
  } catch {}
  throw error;
} finally {
  await browser.close();
}
