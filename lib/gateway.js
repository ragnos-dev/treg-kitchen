import { reserveRecipe, unavailable } from './budget.js';

const model = 'google/gemini-3.1-flash-lite';
const modelUrl = 'https://ai-gateway.vercel.sh/v1/models';
const generationUrl = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const limits = { inputBytes: 30000, outputTokens: 3000, passes: 2 };

function readRates(pricing) {
  const { input, output, varies_by_provider: variesByProvider } = pricing ?? {};
  return !variesByProvider && Number(input) > 0 && Number(input) <= 0.00000025
    && Number(output) > 0 && Number(output) <= 0.0000015;
}

let priceCheckedUntil = 0;

async function checkModelRate(fetcher) {
  if (fetcher === fetch && priceCheckedUntil > Date.now()) return;
  try {
    const response = await fetcher(modelUrl, { signal: AbortSignal.timeout(3500), redirect: 'error' });
    if (!response.ok) throw unavailable();
    const { data } = await response.json();
    if (!readRates(data?.find((entry) => entry.id === model)?.pricing)) throw unavailable();
    if (fetcher === fetch) priceCheckedUntil = Date.now() + 60_000;
  } catch {
    throw unavailable();
  }
}

export async function withGenerationBudget(run, { env = process.env, fetcher = fetch } = {}) {
  const token = env.VERCEL_OIDC_TOKEN || env.AI_GATEWAY_API_KEY;
  if (env.KITCHEN_FREE_CREDITS_VERIFIED !== '1' || !token) throw unavailable();
  await checkModelRate(fetcher);
  // Covers two completions at the published price, with room for framing and rounding.
  await reserveRecipe({ env, fetcher });
  let passes = 0;

  return run(async (messages, maxTokens) => {
    if (++passes > limits.passes || !Number.isInteger(maxTokens) || maxTokens < 1
        || maxTokens > limits.outputTokens || Buffer.byteLength(JSON.stringify(messages)) > limits.inputBytes
        || !Array.isArray(messages) || !messages.every((message) => typeof message.content === 'string')) {
      throw Object.assign(new Error('The recipe exceeded the planning limits.'), { status: 422 });
    }
    let response;
    try {
      response = await fetcher(generationUrl, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(11_000),
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxTokens,
          response_format: { type: 'json_object' },
          providerOptions: {
            gateway: { only: ['google'] },
            google: { thinkingConfig: { thinkingBudget: 0 } },
          },
        }),
      });
    } catch {
      throw unavailable();
    }
    if (response.status === 402 || response.status === 429 || response.status === 403) throw unavailable();
    if (!response.ok) throw Object.assign(new Error('The model could not draft a recipe. Try again.'), { status: 502 });
    try {
      const result = await response.json();
      const choice = result.choices[0];
      if (choice.finish_reason === 'length') throw new Error('Incomplete output');
      return JSON.parse(choice.message.content);
    } catch {
      throw Object.assign(new Error('The model returned an incomplete draft. Try a more focused use case.'), { status: 502 });
    }
  });
}
