// Deterministic browser behavior gate for generated HTML apps.
// Foundation-phase choice: use Playwright from the browser-use install to verify
// concrete app behavior, without involving an LLM browser agent in state advance.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { ProjectSpec } from "../spec/types.js";

export interface HtmlBehaviorGateResult {
  ok: boolean;
  status: "passed" | "failed" | "skipped";
  root: string;
  targetFile: string | null;
  durationMs: number;
  reason?: string;
  output: string;
}

export function runHtmlBehaviorGate(
  cwd: string,
  scopePath: string | undefined,
  spec: ProjectSpec | null,
  timeoutMs: number = 60_000,
): HtmlBehaviorGateResult {
  const started = Date.now();
  const root = resolve(cwd, scopePath ?? ".");
  const stack = (spec?.primaryStack.lang ?? "").toLowerCase();
  const shape = (spec?.appShape ?? "").toLowerCase();
  if (!(stack === "html" || stack === "javascript" || shape === "web")) {
    return skipped(root, null, started, "not a web/html stack");
  }
  const target = findIndexHtml(root);
  if (!target) return skipped(root, null, started, "no index.html found");

  const python = process.env.SHOSHIN_PYTHON ?? "python";
  const probe = spawnSync(python, ["-c", "from playwright.sync_api import sync_playwright; print('ok')"], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (probe.status !== 0) {
    return skipped(root, target, started, "Python Playwright is not installed");
  }

  const script = behaviorScript();
  const run = spawnSync(python, ["-c", script], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    env: {
      ...process.env,
      SHOSHIN_HTML_TARGET: pathToFileURL(target).toString(),
    },
  });
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.trim();
  const ok = run.status === 0 && !run.error;
  return {
    ok,
    status: ok ? "passed" : "failed",
    root,
    targetFile: target,
    durationMs: Date.now() - started,
    reason: ok ? undefined : run.error?.message ?? `behavior gate exited with code ${run.status}`,
    output,
  };
}

function skipped(
  root: string,
  targetFile: string | null,
  started: number,
  reason: string,
): HtmlBehaviorGateResult {
  return {
    ok: true,
    status: "skipped",
    root,
    targetFile,
    durationMs: Date.now() - started,
    reason,
    output: "",
  };
}

function findIndexHtml(root: string): string | null {
  const direct = join(root, "index.html");
  if (existsSync(direct)) return direct;
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    const st = statSync(current);
    if (!st.isDirectory()) continue;
    for (const entry of readdirSync(current)) {
      if (entry === ".git" || entry === "node_modules" || entry === ".shoshin") continue;
      const path = join(current, entry);
      if (entry.toLowerCase() === "index.html" && statSync(path).isFile()) return path;
      if (statSync(path).isDirectory()) stack.push(path);
    }
  }
  return null;
}

function behaviorScript(): string {
  return String.raw`
import os, re, sys
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

target = os.environ["SHOSHIN_HTML_TARGET"]

def first(page, selectors):
    for selector in selectors:
        loc = page.locator(selector)
        if loc.count() > 0:
            return loc.first
    raise AssertionError("Missing selector: " + " | ".join(selectors))

def fill_first(page, selectors, value):
    field = first(page, selectors)
    field.fill(value)
    return field

def click_first(page, selectors):
    button = first(page, selectors)
    button.click()
    page.wait_for_timeout(500)
    return button

def assert_persisted(page, expected):
    page.reload()
    page.wait_for_timeout(500)
    restored = page.locator("body").inner_text()
    if expected not in restored:
        raise AssertionError(f"{expected!r} did not persist after reload")
    return restored

def run_expense_probe(page):
    fill_first(page, [
        "#itemName", "[name='itemName']", "[name='item']", "input[placeholder*='Tomato' i]",
        "input[placeholder*='item' i]", "input[type='text']"
    ], "Tomatoes")
    fill_first(page, [
        "#quantity", "[name='quantity']", "[name='qty']", "input[placeholder*='quantity' i]",
        "input[type='number']"
    ], "2")
    fill_first(page, [
        "#unitPrice", "[name='unitPrice']", "[name='price']", "input[placeholder*='price' i]",
        "input[type='number'] >> nth=1"
    ], "40")
    notes = page.locator("#note, [name='note'], textarea")
    if notes.count() > 0:
        notes.first.fill("morning stock")
    click_first(page, ["button[type='submit']", "input[type='submit']", "button"])
    after = page.locator("body").inner_text()
    if "Tomatoes" not in after:
        raise AssertionError("submitted item is not visible")
    if not re.search(r"80(\.00)?", after):
        raise AssertionError("expected line/grand total 80 after quantity=2 price=40")
    assert_persisted(page, "Tomatoes")
    print("PASS: expense item added, total updated, persistence restored")

def run_planner_probe(page):
    fill_first(page, [
        "#sessionTitle", "#title", "[name='sessionTitle']", "[name='title']",
        "input[placeholder*='session' i]", "input[placeholder*='title' i]", "input[type='text']"
    ], "Saturday Bhajan Practice")
    date_fields = page.locator("input[type='date'], [name='date'], #date, #sessionDate")
    if date_fields.count() > 0:
        date_fields.first.fill("2026-04-25")
    time_fields = page.locator("input[type='time'], [name='startTime'], #startTime, #time")
    if time_fields.count() > 0:
        time_fields.first.fill("18:30")
    lead_fields = page.locator("#leadSinger, [name='leadSinger'], [name='lead'], input[placeholder*='lead' i], input[placeholder*='singer' i]")
    if lead_fields.count() > 0:
        lead_fields.first.fill("Meera")
    attendee_fields = page.locator("#attendees, [name='attendees'], [name='attendeeCount'], input[placeholder*='attendee' i], input[type='number']")
    if attendee_fields.count() > 0:
        attendee_fields.first.fill("12")
    click_first(page, ["button[type='submit']", "input[type='submit']", "button"])
    after = page.locator("body").inner_text()
    if "Saturday Bhajan Practice" not in after:
        raise AssertionError("submitted session is not visible")
    if "12" not in after:
        raise AssertionError("attendee count is not visible")
    assert_persisted(page, "Saturday Bhajan Practice")
    print("PASS: planner session added, totals visible, persistence restored")

def run_counter_probe(page):
    before = page.locator("body").inner_text()
    click_first(page, [
        "button:has-text('+')", "button:has-text('Increment')", "button:has-text('Add')",
        "button:has-text('Increase')", "button"
    ])
    after = page.locator("body").inner_text()
    if before == after and not re.search(r"\b1\b", after):
        raise AssertionError("counter text did not change after click")
    assert_persisted(page, "1")
    print("PASS: counter increments and persistence restored")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.goto(target)
    body = page.locator("body").inner_text(timeout=5000)
    if re.search(r"item|expense|kirana|unit price|price", body, re.I):
        run_expense_probe(page)
    elif re.search(r"session|planner|practice|attendee|lead singer|bhajan", body, re.I):
        run_planner_probe(page)
    elif re.search(r"counter|count|increment", body, re.I):
        run_counter_probe(page)
    else:
        print("SKIP: no deterministic behavior probe for this app intent")
        browser.close()
        sys.exit(0)
    if errors:
        raise AssertionError("browser console errors: " + " | ".join(errors[:3]))
    browser.close()
`;
}
