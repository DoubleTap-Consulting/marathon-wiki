import { describe, expect, it, vi } from "vitest";

import {
  generateMarathonWikiDraft,
  GrokConfigurationError,
  GrokGenerationError,
  GROK_WIKI_PROMPT_VERSION,
} from "./grok";

describe("Grok wiki draft client", () => {
  it("fails clearly before network calls when Grok config is missing", async () => {
    const transport = vi.fn();

    await expect(
      generateMarathonWikiDraft(
        {
          gameTitle: "Marathon",
          pageTitle: "Overrun AR",
          targetSlug: "overrun-ar",
        },
        { env: {}, transport },
      ),
    ).rejects.toThrow(GrokConfigurationError);
    expect(transport).not.toHaveBeenCalled();
  });

  it("requests a stored-off response and parses a JSON draft", async () => {
    const transport = vi.fn(async () =>
      Response.json({
        id: "resp_test_1",
        model: "grok-test",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  title: "Overrun AR",
                  summary: "A concise weapon draft.",
                  bodyMarkdown:
                    "## Overview\n\nThe Overrun AR is a primary weapon entry for editorial review.",
                }),
              },
            ],
          },
        ],
      }),
    );

    const draft = await generateMarathonWikiDraft(
      {
        gameTitle: "Marathon",
        pageTitle: "Overrun AR",
        targetSlug: "overrun-ar",
        sourceNotes: "Use official weapon terminology.",
      },
      {
        env: {
          GROK_API_KEY: "test-key",
          GROK_MODEL: "grok-test",
          GROK_API_BASE_URL: "https://example.test/v1/",
        },
        transport,
      },
    );

    expect(transport).toHaveBeenCalledWith(
      "https://example.test/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining('"store":false'),
      }),
    );
    expect(draft).toEqual({
      title: "Overrun AR",
      summary: "A concise weapon draft.",
      bodyMarkdown:
        "## Overview\n\nThe Overrun AR is a primary weapon entry for editorial review.",
      provider: "xai-grok",
      model: "grok-test",
      responseId: "resp_test_1",
      promptVersion: GROK_WIKI_PROMPT_VERSION,
    });
  });

  it("turns Grok HTTP failures into editor-safe errors", async () => {
    const transport = vi.fn(async () =>
      new Response("invalid api key", { status: 401 }),
    );

    await expect(
      generateMarathonWikiDraft(
        {
          gameTitle: "Marathon",
          pageTitle: "Overrun AR",
          targetSlug: "overrun-ar",
        },
        { env: { GROK_API_KEY: "bad-key" }, transport },
      ),
    ).rejects.toThrow(GrokGenerationError);
  });

  it("rejects malformed model output", async () => {
    const transport = vi.fn(async () =>
      Response.json({
        id: "resp_test_2",
        model: "grok-test",
        output_text: "not json",
      }),
    );

    await expect(
      generateMarathonWikiDraft(
        {
          gameTitle: "Marathon",
          pageTitle: "Overrun AR",
          targetSlug: "overrun-ar",
        },
        { env: { GROK_API_KEY: "test-key" }, transport },
      ),
    ).rejects.toThrow("not valid JSON");
  });
});
