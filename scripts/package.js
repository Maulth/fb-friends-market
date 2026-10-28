/*
 * Builds dist/fb-friends-market.zip, the file people download from the
 * GitHub release and load with "Load unpacked".
 *
 *   npm run package
 *
 * The file list comes from manifest.json and popup.html, so a new script or
 * stylesheet is picked up without editing this. Tests, fixtures, and
 * node_modules stay out. Everything sits in one fb-friends-market/ folder,
 * which the README's install steps rely on. In Windows' "Extract All", the
 * user browses to Documents and gets Documents\fb-friends-market. A
 * folderless zip would spill its files loose into Documents instead.
 *
 * No dependencies: it writes a plain deflate zip with node:zlib.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.join(__dirname, "..");
const FOLDER = "fb-friends-market";
const OUT = path.join(ROOT, "dist", FOLDER + ".zip");

function extensionFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const files = new Set(["manifest.json", "LICENSE", "README.md"]);
  files.add(manifest.background.service_worker);
  files.add(manifest.action.default_popup);
  for (const icon of Object.values(manifest.icons)) files.add(icon);
  for (const r of manifest.declarative_net_request.rule_resources) files.add(r.path);
  for (const cs of manifest.content_scripts) {
    for (const f of [...(cs.js || []), ...(cs.css || [])]) files.add(f);
  }
  // Local files the popup pulls in (popup.css, popup.js).
  const popup = fs.readFileSync(path.join(ROOT, manifest.action.default_popup), "utf8");
  for (const [, ref] of popup.matchAll(/(?:href|src)="([^":#]+)"/g)) files.add(ref);

  const missing = [...files].filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) throw new Error("Missing files: " + missing.join(", "));
  return [...files].sort();
}

// MS-DOS date/time for "now", as zip headers store it.
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

function zip(names) {
  const { time, date } = dosTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of names) {
    const data = fs.readFileSync(path.join(ROOT, name));
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(`${FOLDER}/${name}`, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const names = extensionFiles();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, zip(names));
console.log(`${path.relative(ROOT, OUT)}: ${names.length} files, ${fs.statSync(OUT).size} bytes`);
for (const name of names) console.log("  " + name);
