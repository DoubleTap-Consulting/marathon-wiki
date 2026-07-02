import { describe, expect, it, vi } from "vitest";

import {
  AiGatewayConfigurationError,
  AiGatewayGenerationError,
  AI_GATEWAY_WIKI_PROMPT_VERSION,
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
    const generate = vi.fn(async () => ({
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
    expect(generate.mock.calls[0]?.[0]?.prompt).toContain("Target slug: overrun-ar");
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

  it("defaults to the Grok model through Gateway while allowing API-key auth", async () => {
    const generate = vi.fn(async () => ({
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
        model: "xai/grok-4.3",
      }),
    );
    expect(draft).toMatchObject({
      provider: "vercel-ai-gateway",
      model: "xai/grok-4.3",
      responseId: null,
    });
  });

  it("turns Gateway failures into editor-safe errors", async () => {
    const generate = vi.fn(async () => {
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
});
