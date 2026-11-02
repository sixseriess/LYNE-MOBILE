import { appendFileSync } from "node:fs";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const outputFile = process.env.GITHUB_OUTPUT;

if (!accountId || !apiToken) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
}
if (!/^[a-f0-9]{32}$/i.test(accountId)) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID must be the 32-character account ID from Cloudflare.");
}
if (!outputFile) {
  throw new Error("GITHUB_OUTPUT is missing; run this script from the Deploy LYNE API workflow.");
}

const apiRoot = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;

async function cloudflare(path, init = {}) {
  const response = await fetch(apiRoot + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const details = Array.isArray(payload.errors)
      ? payload.errors.map((item) => item.message).filter(Boolean).join("; ")
      : "";
    throw new Error(`Cloudflare API request failed (${response.status})${details ? `: ${details}` : "."}`);
  }
  return payload.result;
}

async function findDatabase() {
  const result = await cloudflare("/d1/database?name=lyne-catalog&per_page=100");
  const databases = Array.isArray(result) ? result : result?.result || [];
  return databases.find((database) => database.name === "lyne-catalog") || null;
}

async function ensureDatabase() {
  let database = await findDatabase();
  if (!database) {
    try {
      database = await cloudflare("/d1/database", {
        method: "POST",
        body: JSON.stringify({ name: "lyne-catalog", primary_location_hint: "wnam" }),
      });
      console.log("Created D1 database: lyne-catalog");
    } catch (error) {
      // Recover from a concurrent setup run that created the same named database.
      database = await findDatabase();
      if (!database) throw error;
      console.log("D1 database already exists: lyne-catalog");
    }
  } else {
    console.log("Using existing D1 database: lyne-catalog");
  }

  if (!database?.uuid || !/^[a-f0-9-]{36}$/i.test(database.uuid)) {
    throw new Error("Cloudflare did not return a valid D1 database ID for lyne-catalog.");
  }
  return database.uuid;
}

async function listBuckets() {
  const buckets = [];
  let cursor = "";
  do {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const result = await cloudflare("/r2/buckets" + suffix);
    buckets.push(...(Array.isArray(result?.buckets) ? result.buckets : []));
    cursor = result?.truncated && result?.cursor ? result.cursor : "";
  } while (cursor);
  return buckets;
}

async function ensureBucket() {
  let bucket = (await listBuckets()).find((item) => item.name === "lyne-media");
  if (!bucket) {
    try {
      await cloudflare("/r2/buckets", {
        method: "POST",
        body: JSON.stringify({ name: "lyne-media" }),
      });
      console.log("Created R2 bucket: lyne-media");
    } catch (error) {
      // Recover from a concurrent setup run that created the same named bucket.
      bucket = (await listBuckets()).find((item) => item.name === "lyne-media");
      if (!bucket) throw error;
      console.log("R2 bucket already exists: lyne-media");
    }
  } else {
    console.log("Using existing R2 bucket: lyne-media");
  }
}

const databaseId = await ensureDatabase();
await ensureBucket();

// The value is a Cloudflare-generated UUID, validated above, so it is safe for
// a single-line GitHub Actions output.
appendFileSync(outputFile, `database_id=${databaseId}\n`, { encoding: "utf8" });
console.log("Cloudflare resources are ready.");
