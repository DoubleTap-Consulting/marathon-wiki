export type GrokDraftRequest = {
  gameTitle: string;
  pageTitle: string;
  targetSlug: string;
  sourceNotes?: string | null;
  existingPage?: {
    title: string;
    summary: string | null;
    bodyMarkdown: string;
  } | null;
};

export type GrokDraftResult = {
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  provider: "xai-grok";
  model: string;
  responseId: string | null;
  promptVersion: typeof GROK_WIKI_PROMPT_VERSION;
};

export type GrokTransport = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type GrokResponsesResponse = {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string | null;
    }>;
  }>;
};

type ParsedDraft = {
  title?: unknown;
  summary?: unknown;
  bodyMarkdown?: unknown;
};

export const GROK_WIKI_PROMPT_VERSION = "marathon-wiki-phase-5-v1";

const DEFAULT_GROK_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_GROK_MODEL = "grok-4.3";

export class GrokConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrokConfigurationError";
  }
}

export class GrokGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrokGenerationError";
  }
}

export async function generateMarathonWikiDraft(
  request: GrokDraftRequest,
  options: {
    env?: NodeJS.ProcessEnv;
    transport?: GrokTransport;
  } = {},
): Promise<GrokDraftResult> {
  const env = options.env ?? process.env;
  const apiKey = env.GROK_API_KEY || env.XAI_API_KEY;

  if (!apiKey) {
    throw new GrokConfigurationError(
      "Grok API is not configured. Set GROK_API_KEY or XAI_API_KEY before requesting AI drafts.",
    );
  }

  const baseUrl = stripTrailingSlash(env.GROK_API_BASE_URL || DEFAULT_GROK_BASE_URL);
  const model = env.GROK_MODEL || DEFAULT_GROK_MODEL;
  const transport = options.transport ?? fetch;

  const response = await transport(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: buildDraftMessages(request),
      store: false,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    throw new GrokGenerationError(
      `Grok draft generation failed with HTTP ${response.status}. Check GROK_API_KEY and GROK_MODEL.`,
    );
  }

  const payload = (await response.json()) as GrokResponsesResponse;
  const content = getResponseText(payload);

  if (!content) {
    throw new GrokGenerationError("Grok returned an empty draft response.");
  }

  const draft = parseDraftJson(content);

  return {
    title: draft.title,
    summary: draft.summary,
    bodyMarkdown: draft.bodyMarkdown,
    provider: "xai-grok",
    model: payload.model || model,
    responseId: payload.id || null,
    promptVersion: GROK_WIKI_PROMPT_VERSION,
  };
}

function buildDraftMessages(request: GrokDraftRequest) {
  const existingPageText = request.existingPage
    ? [
        `Existing page title: ${request.existingPage.title}`,
        `Existing page summary: ${request.existingPage.summary ?? "None"}`,
        "Existing page markdown:",
        request.existingPage.bodyMarkdown,
      ].join("\n")
    : "No existing page. Draft this as a new page suggestion.";

  return [
    {
      role: "system",
      content:
        "You draft concise, factual wiki page suggestions for a Marathon game wiki. Return only valid JSON. Do not claim publication. Avoid unsupported claims and keep editorial tone neutral.",
    },
    {
      role: "user",
      content: [
        `Game: ${request.gameTitle}`,
        `Target page title: ${request.pageTitle}`,
        `Target slug: ${request.targetSlug}`,
        request.sourceNotes ? `Editor source/context notes: ${request.sourceNotes}` : null,
        existingPageText,
        "",
        "Return JSON with exactly these string fields: title, summary, bodyMarkdown.",
        "The bodyMarkdown field should be Markdown suitable for an editorial suggestion, with headings and short sections.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

function parseDraftJson(content: string): {
  title: string;
  summary: string | null;
  bodyMarkdown: string;
} {
  let parsed: ParsedDraft;

  try {
    parsed = JSON.parse(stripJsonFence(content)) as ParsedDraft;
  } catch {
    throw new GrokGenerationError("Grok draft response was not valid JSON.");
  }
  const title = asNonEmptyString(parsed.title, "title");
  const bodyMarkdown = asNonEmptyString(parsed.bodyMarkdown, "bodyMarkdown");
  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : null;

  if (bodyMarkdown.length < 20) {
    throw new GrokGenerationError("Grok returned a draft body that is too short.");
  }

  return { title, summary, bodyMarkdown };
}

function getResponseText(payload: GrokResponsesResponse) {
  if (payload.output_text?.trim()) {
    return payload.output_text;
  }

  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        return content.text;
      }
    }
  }

  return null;
}

function asNonEmptyString(value: unknown, key: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new GrokGenerationError(`Grok draft response is missing ${key}.`);
  }

  return value.trim();
}

function stripJsonFence(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1] ?? trimmed;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
