import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const secretPath = path.resolve(process.cwd(), ".data", "secret");

function key() {
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  if (!fs.existsSync(secretPath))
    fs.writeFileSync(secretPath, crypto.randomBytes(32), { mode: 0o600, flag: "wx" });
  return crypto.createHash("sha256").update(fs.readFileSync(secretPath)).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

export function decrypt(token: string): string {
  const parts = token.split(".").map((part) => Buffer.from(part, "base64url"));
  if (parts.length !== 3) throw new Error("Invalid encrypted value");
  const [iv, tag, data] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
