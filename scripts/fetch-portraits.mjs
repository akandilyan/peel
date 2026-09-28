// Downloads the test portraits of scripts/portrait-samples.json into
// public/dev-portraits (gitignored: photos of people stay out of the public
// repo) with a manifest for the /dev/portraits page. Run: node scripts/fetch-portraits.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const { samples } = JSON.parse(readFileSync("scripts/portrait-samples.json", "utf8"));
const dir = "public/dev-portraits";
mkdirSync(dir, { recursive: true });

for (const s of samples) {
  const file = `${dir}/${s.id}.jpg`;
  if (existsSync(file)) continue;
  const url = `https://images.unsplash.com/${s.photo}?w=${s.width ?? 1600}&h=${s.width ?? 1600}&fit=max&fm=jpg&q=85`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`${s.id}: ${res.status}`);
    continue;
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${s.id}: ok`);
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(samples, null, 2));
