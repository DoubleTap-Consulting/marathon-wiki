import { describe, expect, it, vi } from "vitest";

import {
  AiGatewayConfigurationError,
  AiGatewayGenerationError,
  AI_GATEWAY_CANONICAL_PROMPT_VERSION,
  AI_GATEWAY_WIKI_PROMPT_VERSION,
  generateMarathonWikiCanonicalPage,
  generateMarathonWikiDraft,
} from "./gateway";

describe("AI Gateway wiki draft client", () => {
  it("fails clearly before model calls when Gateway credentials are missing locally", async () => {
    const generate = vi.fn();

    await expect(
      generateMarathonWikiDraft(
        {
          gameTitle: "Marathon",
          pageTitle: "Overrun AR",
          targetSlug: "overrun-ar",
        },
        { env: {}, generate },
      ),
    ).rejects.toThrow(AiGatewayConfigurationError);
    expect(generate).not.toHaveBeenCalled();
  });

  it("requests a structured Gateway draft with model-agnostic routing metadata", async () => {
    const generate = vi.fn(async (_options: unknown) => ({
      output: {
        title: "Overrun AR",
        summary: "A concise weapon draft.",
        bodyMarkdown:
          "## Overview\n\nThe Overrun AR is a primary weapon entry for editorial review.",
      },
      response: {
        body: {
          id: "gateway_response_1",
        },
      },
    }));

    const draft = await generateMarathonWikiDraft(
      {
        gameTitle: "Marathon",
        pageTitle: "Overrun AR",
        targetSlug: "overrun-ar",
        sourceNotes: "Use official weapon terminology.",
      },
      {
        env: {
          VERCEL_OIDC_TOKEN: "test-oidc-token",
          WIKI_AI_GATEWAY_MODEL: "xai/grok-test",
        },
        generate,
      },
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "xai/grok-test",
        temperature: 0.4,
        providerOptions: {
          gateway: {
            user: "editorial-ai-draft",
            tags: ["feature:wiki-ai-draft", "app:marathon-wiki"],
          },
        },
      }),
    );
    const options = generate.mock.calls[0]?.[0] as { prompt?: string };
    expect(options.prompt).toContain("Target slug: overrun-ar");
    expect(draft).toEqual({
      title: "Overrun AR",
      summary: "A concise weapon draft.",
      bodyMarkdown:
        "## Overview\n\nThe Overrun AR is a primary weapon entry for editorial review.",
      provider: "vercel-ai-gateway",
      model: "xai/grok-test",
      responseId: "gateway_response_1",
      promptVersion: AI_GATEWAY_WIKI_PROMPT_VERSION,
    });
  });

  it("defaults to the Gateway smoke-tested model while allowing API-key auth", async () => {
    const generate = vi.fn(async (_options: unknown) => ({
      output: {
        title: "Weapons",
        summary: null,
        bodyMarkdown: "## Weapons\n\nA valid AI Gateway generated wiki draft.",
      },
    }));

    const draft = await generateMarathonWikiDraft(
      {
        gameTitle: "Marathon",
        pageTitle: "Weapons",
        targetSlug: "weapons",
      },
      {
        env: {
          AI_GATEWAY_API_KEY: "gateway-key",
        },
        generate,
      },
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5-nano",
      }),
    );
    expect(draft).toMatchObject({
      provider: "vercel-ai-gateway",
      model: "openai/gpt-5-nano",
      responseId: null,
    });
  });

  it("turns Gateway failures into editor-safe errors", async () => {
    const generate = vi.fn(async (_options: unknown) => {
      throw new Error("model rejected output");
    });

    await expect(
      generateMarathonWikiDraft(
        {
          gameTitle: "Marathon",
          pageTitle: "Overrun AR",
          targetSlug: "overrun-ar",
        },
        { env: { AI_GATEWAY_API_KEY: "bad-key" }, generate },
      ),
    ).rejects.toThrow(AiGatewayGenerationError);
  });

  it("requests structured canonical page generation through AI Gateway routing", async () => {
    const generate = vi.fn(async (_options: unknown) => ({
      output: {
        title: "Mjolnir Recon 54",
        summary: "Canonical AI page for the player frame.",
        bodyMarkdown:
          "## Overview\n\nMjolnir Recon 54 is described here as canonical wiki content generated through the AI pipeline.",
        sourceContextSummary:
          "Used editor notes about official naming and the prior page revision.",
      },
      response: {
        body: {
          id: "gateway_response_canonical_1",
        },
      },
    }));

    const page = await generateMarathonWikiCanonicalPage(
      {
        gameTitle: "Marathon",
        pageTitle: "Mjolnir Recon 54",
        targetSlug: "mjolnir-recon-54",
        sourceContext: "Use official naming from the reveal page.",
        refreshReason: "manual_refresh",
        existingPage: {
          title: "Mjolnir Recon 54",
          summary: "Old summary",
          bodyMarkdown: "## Overview\n\nOld body.",
          latestRevisionNumber: 2,
        },
      },
      {
        env: {
          VERCEL_OIDC_TOKEN: "test-oidc-token",
          WIKI_AI_GATEWAY_MODEL: "xai/grok-test",
        },
        generate,
      },
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "xai/grok-test",
        temperature: 0.3,
        providerOptions: {
          gateway: {
            user: "canonical-page-generation",
            tags: ["feature:wiki-canonical-generation", "app:marathon-wiki"],
          },
        },
      }),
    );
    const options = generate.mock.calls[0]?.[0] as { prompt?: string };
    expect(options.prompt).toContain("Refresh reason: manual_refresh");
    expect(options.prompt).toContain("Existing revision number: 2");
    expect(page).toEqual({
      title: "Mjolnir Recon 54",
      summary: "Canonical AI page for the player frame.",
      bodyMarkdown:
        "## Overview\n\nMjolnir Recon 54 is described here as canonical wiki content generated through the AI pipeline.",
      sourceContextSummary:
        "Used editor notes about official naming and the prior page revision.",
      provider: "vercel-ai-gateway",
      model: "xai/grok-test",
      responseId: "gateway_response_canonical_1",
      promptVersion: AI_GATEWAY_CANONICAL_PROMPT_VERSION,
    });
  });
});
