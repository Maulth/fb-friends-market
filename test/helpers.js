const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const SCAN_SOURCE = fs.readFileSync(path.join(ROOT, "scan.js"), "utf8");

// Loads scan.js into a jsdom window the same way Chrome loads it into a
// content script: as a classic script that sets window.__fbmScan.
function load(html, url) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.eval(SCAN_SOURCE);
  return { window: dom.window, document: dom.window.document, scan: dom.window.__fbmScan };
}

function loadFixture(name, url = "https://www.facebook.com/?filter=friends&sk=h_chr") {
  return load(fs.readFileSync(path.join(ROOT, "fixtures", name), "utf8"), url);
}

// The scanner API with no document, for the pure URL functions.
const scan = load("<!DOCTYPE html>", "https://www.facebook.com/").scan;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, name), "utf8"));
}

module.exports = { ROOT, load, loadFixture, scan, readJson };
