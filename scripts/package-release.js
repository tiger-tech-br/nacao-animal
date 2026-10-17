"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const root = path.resolve(__dirname, "..");
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!/^[0-9A-Za-z._-]+$/.test(packageInfo.version)) throw new Error("Versão inválida para empacotamento.");
const directories = ["admin", "config", "controllers", "database", "docs", "middlewares", "models", "public", "routes", "scripts", "services", "tests", "views", ".github"];
const files = [".env.example", ".gitignore", ".hintrc", "app.js", "server.js", "railway.json", "package.json", "package-lock.json", "README.MD", "LICENSE", "CUPONS.md", "PGADMIN-PRODUTOS.md"];
const blockedDirectories = new Set(["node_modules", ".git", "backups", "logs", "dist", "coverage", ".agents", ".codex", ".aws"]);
const entries = [];
function add(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Link não permitido no pacote: ${relative}`);
    const basename = path.basename(relative);
    if (stat.isDirectory()) {
        if (blockedDirectories.has(basename)) return;
        fs.readdirSync(absolute).sort().forEach(name => add(path.join(relative, name)));
    } else if (stat.isFile() && !/\.log$|\.dump$|\.bak$|\.zip$/i.test(basename) &&
               (!basename.startsWith(".env") || relative === ".env.example")) {
        entries.push({ name: relative.split(path.sep).join("/"), data: fs.readFileSync(absolute) });
    }
}
files.forEach(add);
directories.forEach(add);
// Os valores locais nunca fazem parte da entrega; detectar também cópias acidentais no código.
const localEnvPath = path.join(root, ".env");
const localEnv = fs.existsSync(localEnvPath) ? require("dotenv").parse(fs.readFileSync(localEnvPath)) : {};
const sensitive = Object.entries({ ...localEnv, ...process.env }).filter(([name, value]) =>
    /PASSWORD|SECRET|TOKEN|API_KEY|DATABASE.*URL|POSTGRES.*URL/.test(name) && String(value).length >= 8
);
for (const entry of entries) {
    if (!/\.(?:js|json|sql|md|html|yml|yaml|example)$/i.test(entry.name)) continue;
    const text = entry.data.toString("utf8");
    for (const [name, value] of sensitive) {
        if (text.includes(String(value))) throw new Error(`Credencial ${name} encontrada em ${entry.name}. Empacotamento interrompido.`);
    }
}
const manifest = {
    product: "PetFlow v2", version: packageInfo.version,
    instructions: "Consulte docs/entrega-comercial.md. Configure .env com contas próprias antes de instalar.",
    files: entries.map(entry => ({ path: entry.name, sha256: crypto.createHash("sha256").update(entry.data).digest("hex") }))
};
entries.push({ name: "ENTREGA.json", data: Buffer.from(JSON.stringify(manifest, null, 2) + "\n") });
entries.sort((a, b) => a.name.localeCompare(b.name));
if (entries.length > 65535 || entries.reduce((size, entry) => size + entry.data.length, 0) > 200 * 1024 * 1024) {
    throw new Error("Pacote excede o limite do empacotador.");
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
    return n >>> 0;
});
function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
}
const chunks = [], central = [];
let offset = 0;
for (const entry of entries) {
    const name = Buffer.from(`petflow-v2/${entry.name}`, "utf8");
    const compressed = zlib.deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x0021, 12); // 1980-01-01: datas consistentes no ZIP.
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(entry.data.length, 22); header.writeUInt16LE(name.length, 26);
    chunks.push(header, name, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8); record.writeUInt16LE(8, 10); record.writeUInt16LE(0x0021, 14);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(entry.data.length, 24); record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42); central.push(record, name);
    offset += header.length + name.length + compressed.length;
}
const centralData = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...chunks, centralData, end]);
const outputDirectory = path.join(root, "dist");
fs.mkdirSync(outputDirectory, { recursive: true });
const archivePath = path.join(outputDirectory, `petflow-v2-${packageInfo.version}.zip`);
fs.writeFileSync(archivePath, archive);
const digest = crypto.createHash("sha256").update(archive).digest("hex");
fs.writeFileSync(`${archivePath}.sha256`, `${digest}  ${path.basename(archivePath)}\n`);
console.log(`Pacote criado: ${archivePath}`);
console.log(`${entries.length} arquivos; ${(archive.length / 1024 / 1024).toFixed(2)} MB; sem .env, histórico Git, backups ou node_modules.`);
console.log(`SHA-256: ${digest}`);
