/**
 * The AI editor's model caller: structured output through the Vercel AI Gateway, with gpt-5-mini
 * as the primary model and gpt-5-nano as the fallback. It also enforces a spend cap and a minimum
 * gap between calls. Spend is priced from the token usage the gateway reports.
 */
import { generateText, Output } from "ai";

import type { StructuredCall } from "./editor.ts";

export const PRIMARY_MODEL = "openai/gpt-5-mini";
export const FALLBACK_MODEL = "openai/gpt-5-nano";

/** USD per token, Vercel AI Gateway /v1/models list prices (fetched 2026-11-14). */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "openai/gpt-5-mini": { input: 0.25e-6, output: 2e-6 },
  "openai/gpt-5-nano": { input: 0.05e-6, output: 0.4e-6 },
};

/** Assumed worst case for one call when checking the cap before calling. */
export const MAX_CALL_USD = 0.25;

export type SpendEntry = { at: string; page: string; step: string; model: string; inputTokens: number; outputTokens: number; usd: number };

export interface SpendLedger {
  totalUsd(): number;
  record(entry: SpendEntry): void;
}

/** Per-run ledger: the cap applies to one worker run. */
export class MemoryLedger implements SpendLedger {
  readonly entries: SpendEntry[] = [];
  totalUsd() {
    return this.entries.reduce((sum, entry) => sum + entry.usd, 0);
  }
  record(entry: SpendEntry) {
    this.entries.push(entry);
  }
}

export class BudgetExceeded extends Error {
  name = "BudgetExceeded";
}

export function priceUsage(model: string, usage: { inputTokens?: number; outputTokens?: number } | undefined) {
  const price = MODEL_PRICES[model] ?? MODEL_PRICES[PRIMARY_MODEL];
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  return { inputTokens, outputTokens, usd: inputTokens * price.input + outputTokens * price.output };
}

export function hasGatewayCredential(env: Partial<NodeJS.ProcessEnv> = process.env) {
  return Boolean(env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim());
}

type GenerateText = typeof generateText;

export function createGatewayCaller(options: {
  ledger: SpendLedger;
  capUsd: number;
  models?: string[];
  minIntervalMs?: number;
  tags?: string[];
  generate?: GenerateText;
  log?: (message: string) => void;
  /** A hung request fails over to the next model instead of stalling the run. */
  timeoutMs?: number;
}): StructuredCall {
  const models = options.models ?? [PRIMARY_MODEL, FALLBACK_MODEL];
  const generate = options.generate ?? generateText;
  let lastCallAt = 0;

  return async ({ page, step, system, prompt, schema }) => {
    if (options.ledger.totalUsd() + MAX_CALL_USD > options.capUsd) {
      throw new BudgetExceeded(`Spend cap: $${options.ledger.totalUsd().toFixed(2)} spent; the next call could pass $${options.capUsd}.`);
    }
    let lastError: unknown;
    for (const model of models) {
      const wait = lastCallAt + (options.minIntervalMs ?? 0) - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastCallAt = Date.now();
      try {
        const result = await generate({
          model,
          system,
          prompt,
          output: Output.object({ schema }),
          abortSignal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
          providerOptions: {
            openai: { reasoningEffort: "low" },
            gateway: { tags: options.tags ?? ["app:marathon-wiki", "feature:ai-editor"] },
          },
        });
        options.ledger.record({ at: new Date().toISOString(), page, step, model, ...priceUsage(model, result.usage) });
        const response = result.response as { modelId?: string; id?: string } | undefined;
        const modelId = response?.modelId ?? model;
        return { output: schema.parse(result.output), modelId: modelId.includes("/") ? modelId : `${model.split("/")[0]}/${modelId}`, responseId: response?.id ?? null };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        options.log?.(`model call failed: page=${page} step=${step} model=${model}: ${message.slice(0, 200)}`);
        if (/401|403|unauthori[sz]ed|forbidden|api key|credential/i.test(message)) break; // a fallback model cannot fix auth
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };
}
