export async function readResponseError(response: Response): Promise<string> {
  const text = (await response.text()).trim();

  if (!text) {
    return `Search failed (${response.status})`;
  }

  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.error ?? data.message ?? text;
  } catch {
    const lower = text.toLowerCase();

    if (
      lower.includes("an error occurred") ||
      lower.includes("function_invocation_timeout") ||
      lower.includes("timed out")
    ) {
      return "The search timed out. Try scanning fewer pages (start with 5–10). Large scans may require a Vercel Pro plan.";
    }

    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  }
}

export function parseStreamLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    const lower = line.toLowerCase();

    if (
      lower.includes("an error occurred") ||
      lower.includes("function_invocation_timeout") ||
      lower.includes("timed out")
    ) {
      throw new Error(
        "The search timed out. Try scanning fewer pages (start with 5–10). Large scans may require a Vercel Pro plan.",
      );
    }

    throw new Error("The search connection was interrupted. Try again with fewer pages.");
  }
}
