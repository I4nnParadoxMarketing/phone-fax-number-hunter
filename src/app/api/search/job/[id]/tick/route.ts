import { getBaseUrl, getJobSecret, loadJob, saveJob } from "@/lib/job-store";
import { processJobTick } from "@/lib/job-processor";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const secret = request.headers.get("x-job-secret");
  if (secret !== getJobSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await loadJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "complete" || job.status === "failed") {
    return NextResponse.json({ ok: true, status: job.status });
  }

  try {
    const baseUrl = getBaseUrl(request);
    const updated = await processJobTick(job, baseUrl);
    return NextResponse.json({ ok: true, status: updated.status, nextIndex: updated.nextIndex });
  } catch (error) {
    job.status = "failed";
    job.errorMessage = error instanceof Error ? error.message : "Background search failed";
    await saveJob(job);
    return NextResponse.json({ error: job.errorMessage }, { status: 500 });
  }
}
