import { loadJob } from "@/lib/job-store";
import { jobToProgress, jobToSearchResponse } from "@/lib/job-processor";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await loadJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    job,
    progress: jobToProgress(job),
    result: job.status === "complete" ? jobToSearchResponse(job) : null,
    error: job.status === "failed" ? job.errorMessage ?? "Background search failed" : null,
  });
}
