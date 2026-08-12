import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { get, put } from "@vercel/blob";
import type { SearchJob } from "./job-types";

const LOCAL_JOBS_DIR = path.join(process.cwd(), ".jobs");

function jobPath(id: string): string {
  return `jobs/${id}.json`;
}

function localJobPath(id: string): string {
  return path.join(LOCAL_JOBS_DIR, `${id}.json`);
}

async function saveJobLocal(job: SearchJob): Promise<void> {
  await mkdir(LOCAL_JOBS_DIR, { recursive: true });
  await writeFile(localJobPath(job.id), JSON.stringify(job), "utf8");
}

async function loadJobLocal(id: string): Promise<SearchJob | null> {
  try {
    const raw = await readFile(localJobPath(id), "utf8");
    return JSON.parse(raw) as SearchJob;
  } catch {
    return null;
  }
}

async function saveJobBlob(job: SearchJob): Promise<void> {
  await put(jobPath(job.id), JSON.stringify(job), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function loadJobBlob(id: string): Promise<SearchJob | null> {
  try {
    const result = await get(jobPath(id), { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    const raw = await new Response(result.stream).text();
    return JSON.parse(raw) as SearchJob;
  } catch {
    return null;
  }
}

export function isBackgroundStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) || process.env.NODE_ENV !== "production";
}

export async function saveJob(job: SearchJob): Promise<void> {
  job.updatedAt = new Date().toISOString();

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await saveJobBlob(job);
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Background search requires Vercel Blob storage. Add Blob to your Vercel project, then redeploy.",
    );
  }

  await saveJobLocal(job);
}

export async function loadJob(id: string): Promise<SearchJob | null> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return loadJobBlob(id);
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return loadJobLocal(id);
}

export function getJobSecret(): string {
  return process.env.JOB_SECRET ?? "dev-job-secret";
}

export function getBaseUrl(request?: Request): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (request) {
    const host = request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}

export async function scheduleJobTick(jobId: string, baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/search/job/${jobId}/tick`, {
    method: "POST",
    headers: {
      "x-job-secret": getJobSecret(),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to schedule job tick: ${text.slice(0, 200)}`);
  }
}
