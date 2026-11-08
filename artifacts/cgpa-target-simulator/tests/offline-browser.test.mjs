import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const viteCli = path.join(projectRoot, "node_modules/vite/bin/vite.js");
const chromiumPath = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";

let server;
let browser;
let baseUrl;

async function getFreePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Vite exited before it became ready (code ${child.exitCode}).`,
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Vite did not become ready: ${lastError || "timed out"}`);
}

before(async () => {
  assert.ok(
    existsSync(chromiumPath),
    `Chromium was not found at ${chromiumPath}; set CHROMIUM_PATH to a browser executable.`,
  );

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}/`;
  server = spawn(
    process.execPath,
    [
      viteCli,
      "--config",
      "vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, PORT: String(port), BASE_PATH: "/" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForServer(baseUrl, server);
    browser = await chromium.launch({
      executablePath: chromiumPath,
      args: ["--no-sandbox"],
    });
  } catch (error) {
    server.kill("SIGTERM");
    throw new Error(`${error.message}\n${serverOutput}`);
  }
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 3_000).unref();
    });
  }
});

test("the dashboard remains editable after offline reload and saves edits after reconnect", async () => {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#page-title").waitFor();
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    await page.evaluate(() => navigator.serviceWorker.ready);

    // Reload once under service-worker control so every app asset is fetched
    // through the cache before the browser is disconnected.
    await page.reload({ waitUntil: "networkidle" });
    await page
      .locator('[data-testid="status-save"]')
      .getByText("Saved offline on this device")
      .waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#trajectory-chart");
      if (!canvas || canvas.hidden || canvas.width === 0 || canvas.height === 0)
        return false;
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let visiblePixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) visiblePixels += 1;
      }
      return visiblePixels > 100;
    });

    const cacheState = await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheNames = await caches.keys();
      const urls = [];
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        urls.push(...(await cache.keys()).map((request) => request.url));
      }
      return {
        controller: Boolean(navigator.serviceWorker.controller),
        activeWorker: registrations.some(
          (registration) => registration.active?.state === "activated",
        ),
        cachedUrls: [...new Set(urls)],
      };
    });
    assert.equal(
      cacheState.controller,
      true,
      "the page should be controlled before going offline",
    );
    assert.equal(
      cacheState.activeWorker,
      true,
      "an active service worker should be ready",
    );
    assert.ok(
      cacheState.cachedUrls.some((url) => url.endsWith("/index.html")),
      "the app shell should be cached",
    );
    assert.ok(
      cacheState.cachedUrls.some((url) => url.includes("/src/simulator.js")),
      "the simulator module should be cached",
    );
    assert.ok(
      cacheState.cachedUrls.some((url) => url.toLowerCase().includes("chart")),
      "the chart module should be cached",
    );

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator("#page-title").waitFor();
    await page.locator('[data-testid="input-target-cgpa"]').waitFor();
    assert.match(
      await page.locator('[data-testid="text-semester-count"]').innerText(),
      /^2 semesters$/i,
    );
    const semesterSummary = page.locator('[data-testid="table-semester-gpa"]');
    const semesterRows = semesterSummary.locator("tbody tr");
    assert.equal(await semesterRows.count(), 2);
    assert.equal(
      await semesterRows.first().locator('[data-column="semester-gpa"]').innerText(),
      "3.42",
    );
    assert.equal(
      await semesterRows.first().locator('[data-column="target-gpa"]').innerText(),
      "3.60",
    );

    const chart = page.locator("#trajectory-chart");
    await chart.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#trajectory-chart");
      if (!canvas || canvas.hidden || canvas.width === 0 || canvas.height === 0)
        return false;
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let visiblePixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) visiblePixels += 1;
      }
      return visiblePixels > 100;
    });

    const themeButton = page.locator('[data-testid="button-theme-toggle"]');
    await themeButton.click();
    await page.waitForFunction(() =>
      document.documentElement.classList.contains("dark"),
    );
    assert.equal(await themeButton.getAttribute("aria-pressed"), "true");
    await page.waitForFunction(
      () =>
        new Promise((resolve) => {
          const openRequest = indexedDB.open("studyline-cgpa");
          openRequest.onerror = () => resolve(false);
          openRequest.onsuccess = () => {
            const database = openRequest.result;
            const request = database
              .transaction("records", "readonly")
              .objectStore("records")
              .get("theme");
            request.onsuccess = () => {
              const isDark = request.result?.value === "dark";
              database.close();
              resolve(isDark);
            };
            request.onerror = () => {
              database.close();
              resolve(false);
            };
          };
        }),
      null,
      { timeout: 5_000 },
    );

    const requiredGpa = page
      .locator('[data-testid="text-required-gpa"]')
      .first();
    const originalRequiredGpa = await requiredGpa.innerText();
    await page.locator('[data-testid="input-target-cgpa"]').fill("3.95");
    await page.waitForFunction((original) => {
      return (
        document.querySelector('[data-testid="text-required-gpa"]')
          ?.textContent !== original
      );
    }, originalRequiredGpa);
    const updatedRequiredGpa = await requiredGpa.innerText();
    assert.notEqual(
      updatedRequiredGpa,
      originalRequiredGpa,
      "changing the target should recalculate the required GPA",
    );
    assert.equal(
      await semesterRows.first().locator('[data-column="target-gpa"]').innerText(),
      "3.95",
      "the text summary should track the chart target",
    );

    const chartBeforeGradeChange = await page
      .locator("#trajectory-chart")
      .evaluate((canvas) => canvas.toDataURL());
    const firstCourse = page
      .locator('[data-testid^="input-course-name-"]')
      .first();
    const firstCourseId = await firstCourse.getAttribute("data-testid");
    await firstCourse.fill("Offline edited biology course");
    const firstGrade = page
      .locator('[data-testid^="select-course-grade-"]')
      .first();
    await firstGrade.selectOption("C");
    await page.waitForFunction(
      (previousImage) => {
        const canvas = document.querySelector("#trajectory-chart");
        return canvas && canvas.toDataURL() !== previousImage;
      },
      chartBeforeGradeChange,
    );
    assert.equal(
      await semesterRows.first().locator('[data-column="semester-gpa"]').innerText(),
      "3.08",
      "the text summary should recalculate when a course grade changes",
    );

    await page
      .locator('[data-testid^="input-semester-name-"]')
      .first()
      .fill("Fall 2026");
    assert.equal(
      await semesterRows.first().locator("th[scope='row']").innerText(),
      "Fall 2026",
      "the text summary should track semester name changes",
    );
    await page.locator('[data-testid="button-add-semester"]').click();
    assert.equal(await semesterRows.count(), 3);
    assert.equal(
      await semesterRows.nth(2).locator('[data-column="semester-gpa"]').innerText(),
      "No GPA",
      "an empty semester should be identified as having no GPA",
    );
    assert.equal(
      await semesterRows.nth(2).locator('[data-column="target-gpa"]').innerText(),
      "3.95",
    );
    await page
      .locator('[data-testid^="button-remove-semester-"]')
      .nth(2)
      .click();
    assert.equal(await semesterRows.count(), 2);

    await page
      .locator('[data-testid="status-save"]')
      .getByText("Saved offline on this device")
      .waitFor();
    assert.equal(
      await page.locator(`[data-testid="${firstCourseId}"]`).inputValue(),
      "Offline edited biology course",
    );

    await context.setOffline(false);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#page-title").waitFor();
    await page
      .locator('[data-testid="status-save"]')
      .getByText("Saved offline on this device")
      .waitFor();
    assert.equal(
      await page.locator(`[data-testid="${firstCourseId}"]`).inputValue(),
      "Offline edited biology course",
    );
    assert.equal(
      await page.locator('[data-testid="input-target-cgpa"]').inputValue(),
      "3.95",
    );
    const themeAfterReconnect = await page
      .locator('[data-testid="button-theme-toggle"]')
      .getAttribute("aria-pressed");
    assert.equal(
      themeAfterReconnect,
      "true",
      `dark theme should survive reconnect; html class=${await page.locator("html").getAttribute("class")}`,
    );
    assert.equal(
      await page
        .locator(`[data-testid^="select-course-grade-"]`)
        .first()
        .inputValue(),
      "C",
    );
    assert.deepEqual(
      pageErrors,
      [],
      `browser runtime errors: ${pageErrors.join("; ")}`,
    );
  } finally {
    await context.close();
  }
});

test("print media shows the latest read-only progress summary", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-testid="button-print-summary"]').waitFor();
    const summary = page.locator(".print-only-summary");
    const initialCgpa = await summary.locator(".print-metrics > div").nth(0).locator("dd").innerText();

    await page.locator('[data-testid="input-target-cgpa"]').fill("3.8");
    await page.locator('[data-testid^="select-course-grade-"]').first().selectOption("F");
    assert.equal(
      await summary.locator(".print-metrics > div").nth(1).locator("dd").innerText(),
      "3.80 / 4.0",
    );
    assert.notEqual(
      await summary.locator(".print-metrics > div").nth(0).locator("dd").innerText(),
      initialCgpa,
      "the printed current CGPA should reflect edited coursework",
    );

    await page.emulateMedia({ media: "print" });
    const printStyles = await page.evaluate(() => {
      const summary = document.querySelector(".print-only-summary");
      const toolbar = document.querySelector(".action-toolbar");
      const metrics = document.querySelector(".metric-grid");
      const hiddenSiblings = [...document.querySelectorAll(".main-content > *")]
        .filter((element) => !element.classList.contains("print-only-summary"))
        .every((element) => getComputedStyle(element).display === "none");
      return {
        mediaMatches: matchMedia("print").matches,
        summaryDisplay: getComputedStyle(summary).display,
        toolbarDisplay: getComputedStyle(toolbar).display,
        metricsDisplay: getComputedStyle(metrics).display,
        hiddenSiblings,
      };
    });
    assert.deepEqual(printStyles, {
      mediaMatches: true,
      summaryDisplay: "block",
      toolbarDisplay: "none",
      metricsDisplay: "none",
      hiddenSiblings: true,
    });
  } finally {
    await context.close();
  }
});
