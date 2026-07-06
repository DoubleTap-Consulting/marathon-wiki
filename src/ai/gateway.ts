import { APICallError, generateText, Output } from "ai";
import { z } from "zod";

export type GatewayDraftRequest = {
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

export type GatewayCanonicalPageRequest = {
  gameTitle: string;
  pageTitle: string;
  targetSlug: string;
  sourceContext?: string | null;
  refreshReason: string;
  existingPage?: {
    title: string;
    summary: string | null;
    bodyMarkdown: string;
    latestRevisionNumber?: number;
  } | null;
};

export type GatewayDraftResult = {
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  provider: "vercel-ai-gateway";
  model: string;
  responseId: string | null;
  promptVersion: typeof AI_GATEWAY_WIKI_PROMPT_VERSION;
};

export type GatewayCanonicalPageResult = {
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  sourceContextSummary: string;
  provider: "vercel-ai-gateway";
  model: string;
  responseId: string | null;
  promptVersion: typeof AI_GATEWAY_CANONICAL_PROMPT_VERSION;
};

type GatewayGenerateTextResult = {
  output: AiDraftOutput | AiCanonicalPageOutput;
  response?: {
    body?: unknown;
  };
};

export type GatewayGenerateText = (
  options: Parameters<typeof generateText>[0],
) => Promise<GatewayGenerateTextResult>;

type AiDraftOutput = z.infer<typeof aiDraftSchema>;
type AiCanonicalPageOutput = z.infer<typeof aiCanonicalPageSchema>;

export const AI_GATEWAY_WIKI_PROMPT_VERSION = "marathon-wiki-phase-5-v2";
export const AI_GATEWAY_CANONICAL_PROMPT_VERSION =
  "marathon-wiki-canonical-v1";

const DEFAULT_AI_GATEWAY_MODEL = "openai/gpt-5-nano";

const aiDraftSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().nullable(),
  bodyMarkdown: z.string().trim().min(20),
});

const aiCanonicalPageSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().nullable(),
  bodyMarkdown: z.string().trim().min(50),
  sourceContextSummary: z.string().trim().min(1),
});

export class AiGatewayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGatewayConfigurationError";
  }
}

export class AiGatewayGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGatewayGenerationError";
  }
}

export async function generateMarathonWikiDraft(
  request: GatewayDraftRequest,
  options: {
    env?: Partial<NodeJS.ProcessEnv>;
    generate?: GatewayGenerateText;
  } = {},
): Promise<GatewayDraftResult> {
  const env = options.env ?? process.env;

  if (!hasGatewayCredentials(env)) {
    throw new AiGatewayConfigurationError(
      "AI Gateway is not configured. Enable Vercel AI Gateway and run `vercel env pull .env.local`, or set AI_GATEWAY_API_KEY.",
    );
  }

  const model = getGatewayModel(env);
  const generate = options.generate ?? generateText;

  try {
    const result = await generate({
      model,
      system:
        "You draft concise, factual wiki page suggestions for a Marathon game wiki. Do not claim publication. Avoid unsupported claims and keep editorial tone neutral.",
      prompt: buildDraftPrompt(request),
      output: Output.object({
        schema: aiDraftSchema,
      }),
      temperature: 0.4,
      providerOptions: {
        gateway: {
          user: "editorial-ai-draft",
          tags: ["feature:wiki-ai-draft", "app:marathon-wiki"],
        },
      },
    });
    const output = aiDraftSchema.parse(result.output);

    return {
      title: output.title,
      summary: output.summary?.trim() || null,
      bodyMarkdown: output.bodyMarkdown,
      provider: "vercel-ai-gateway",
      model,
      responseId: getGatewayResponseId(result.response?.body),
      promptVersion: AI_GATEWAY_WIKI_PROMPT_VERSION,
    };
  } catch (error) {
    if (error instanceof AiGatewayGenerationError) {
      throw error;
    }

    if (APICallError.isInstance(error)) {
      throw new AiGatewayGenerationError(
        `AI Gateway draft generation failed with HTTP ${error.statusCode}. Check AI Gateway access and WIKI_AI_GATEWAY_MODEL.`,
      );
    }

    throw new AiGatewayGenerationError(
      error instanceof Error
        ? `AI Gateway draft generation failed: ${error.message}`
        : "AI Gateway draft generation failed.",
    );
  }
}

export async function generateMarathonWikiCanonicalPage(
  request: GatewayCanonicalPageRequest,
  options: {
    env?: Partial<NodeJS.ProcessEnv>;
    generate?: GatewayGenerateText;
  } = {},
): Promise<GatewayCanonicalPageResult> {
  const env = options.env ?? process.env;

  if (!hasGatewayCredentials(env)) {
    throw new AiGatewayConfigurationError(
      "AI Gateway is not configured. Enable Vercel AI Gateway and run `vercel env pull .env.local`, or set AI_GATEWAY_API_KEY.",
    );
  }

  const model = getGatewayModel(env);
  const generate = options.generate ?? generateText;

  try {
    const result = await generate({
      model,
      system:
        "You write canonical public Marathon wiki articles. Produce source-backed neutral synthesis, keep uncertainty visible, and do not include community notes or editorial process commentary in the article body.",
      prompt: buildCanonicalPagePrompt(request),
      output: Output.object({
        schema: aiCanonicalPageSchema,
      }),
      temperature: 0.3,
      providerOptions: {
        gateway: {
          user: "canonical-page-generation",
          tags: ["feature:wiki-canonical-generation", "app:marathon-wiki"],
        },
      },
    });
    const output = aiCanonicalPageSchema.parse(result.output);

    return {
      title: output.title,
      summary: output.summary?.trim() || null,
      bodyMarkdown: output.bodyMarkdown,
      sourceContextSummary: output.sourceContextSummary,
      provider: "vercel-ai-gateway",
      model,
      responseId: getGatewayResponseId(result.response?.body),
      promptVersion: AI_GATEWAY_CANONICAL_PROMPT_VERSION,
    };
  } catch (error) {
    if (error instanceof AiGatewayGenerationError) {
      throw error;
    }

    if (APICallError.isInstance(error)) {
      throw new AiGatewayGenerationError(
        `AI Gateway canonical generation failed with HTTP ${error.statusCode}. Check AI Gateway access and WIKI_AI_GATEWAY_MODEL.`,
      );
    }

    throw new AiGatewayGenerationError(
      error instanceof Error
        ? `AI Gateway canonical generation failed: ${error.message}`
        : "AI Gateway canonical generation failed.",
    );
  }
}

function getGatewayModel(env: Partial<NodeJS.ProcessEnv>) {
  return (
    env.WIKI_AI_GATEWAY_MODEL?.trim() ||
    env.AI_GATEWAY_MODEL?.trim() ||
    DEFAULT_AI_GATEWAY_MODEL
  );
}

function hasGatewayCredentials(env: Partial<NodeJS.ProcessEnv>) {
  return Boolean(
    env.AI_GATEWAY_API_KEY?.trim() ||
      env.VERCEL_OIDC_TOKEN?.trim() ||
      env.VERCEL === "1" ||
      env.VERCEL_ENV,
  );
}

function buildDraftPrompt(request: GatewayDraftRequest) {
  const existingPageText = request.existingPage
    ? [
        `Existing page title: ${request.existingPage.title}`,
        `Existing page summary: ${request.existingPage.summary ?? "None"}`,
        "Existing page markdown:",
        request.existingPage.bodyMarkdown,
      ].join("\n")
    : "No existing page. Draft this as a new page suggestion.";

  return [
    `Game: ${request.gameTitle}`,
    `Target page title: ${request.pageTitle}`,
    `Target slug: ${request.targetSlug}`,
    request.sourceNotes ? `Editor source/context notes: ${request.sourceNotes}` : null,
    existingPageText,
    "",
    "Return a structured draft with title, summary, and bodyMarkdown.",
    "The bodyMarkdown field should be Markdown suitable for an editorial suggestion, with headings and short sections.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCanonicalPagePrompt(request: GatewayCanonicalPageRequest) {
  const existingPageText = request.existingPage
    ? [
        `Existing page title: ${request.existingPage.title}`,
        `Existing page summary: ${request.existingPage.summary ?? "None"}`,
        request.existingPage.latestRevisionNumber
          ? `Existing revision number: ${request.existingPage.latestRevisionNumber}`
          : null,
        "Existing canonical markdown:",
        request.existingPage.bodyMarkdown,
      ]
        .filter(Boolean)
        .join("\n")
    : "No existing canonical page. Generate the first published page revision.";

  return [
    `Game: ${request.gameTitle}`,
    `Target page title: ${request.pageTitle}`,
    `Target slug: ${request.targetSlug}`,
    `Refresh reason: ${request.refreshReason}`,
    request.sourceContext
      ? `Editor source/context notes:\n${request.sourceContext}`
      : "Editor source/context notes: None supplied.",
    existingPageText,
    "",
    "Return a structured canonical page with title, summary, bodyMarkdown, and sourceContextSummary.",
    "The bodyMarkdown field is the public article body. Use Markdown headings and concise sections.",
    "Do not include a top-level H1 page title in bodyMarkdown; the page title is rendered separately. Start with section headings such as ## Overview.",
    "The sourceContextSummary field must briefly summarize the source/context material and prior revision signals used for this generation.",
  ]
    .filter(Boolean)
    .join("\n");
}

function getGatewayResponseId(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const id = (body as { id?: unknown }).id;

  return typeof id === "string" && id.trim() ? id : null;
}
