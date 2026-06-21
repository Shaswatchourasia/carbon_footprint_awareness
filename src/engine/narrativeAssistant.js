const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Turns the structured, rule-engine output into a short, friendly paragraph.
 *
 * The app NEVER depends on this succeeding:
 *  - If no ANTHROPIC_API_KEY is configured, we skip the network call
 *    entirely and use a deterministic template built from the same
 *    structured data the rule engine already produced.
 *  - If the API call fails for any reason (network, auth, rate limit), we
 *    log the failure server-side and silently fall back to the same
 *    template, so a flaky/missing key never breaks the user-facing feature.
 *
 * This keeps the "smart assistant" honestly smart even with zero
 * configuration, while still demonstrating how an LLM layer can be bolted
 * on for richer natural-language framing.
 */
async function narrateInsights(profile, insights) {
  if (!env.hasAiNarration()) {
    return buildTemplateNarrative(profile, insights);
  }

  try {
    return await callAnthropic(profile, insights);
  } catch (err) {
    logger.warn('AI narration failed, falling back to templated narrative', {
      error: err.message,
    });
    return buildTemplateNarrative(profile, insights);
  }
}

function buildTemplateNarrative(profile, insights) {
  const { annualTonnes, benchmarkTonnes, vsBenchmarkPct } = insights.totals;
  const comparison =
    vsBenchmarkPct <= 0
      ? `which is ${Math.abs(vsBenchmarkPct)}% below the average for your country`
      : `which is ${vsBenchmarkPct}% above the average for your country`;

  const top = insights.recommendations[0];
  const trendLine = insights.trend.message;

  const lines = [
    `Right now you're tracking at roughly ${annualTonnes} tonnes of CO2e a year, ${comparison} (${benchmarkTonnes} t).`,
    trendLine,
  ];

  if (top) {
    lines.push(
      `Your highest-leverage next step: ${top.title.toLowerCase()}. ${top.rationale} That alone is worth an estimated ${top.estAnnualSavingsKg} kg CO2e a year.`
    );
  }

  return lines.join(' ');
}

async function callAnthropic(profile, insights) {
  const prompt = [
    'You are a concise, encouraging sustainability coach.',
    'Given this user context and computed footprint data (JSON), write a short, ',
    'warm, plain-language paragraph (max 80 words). Do not invent numbers - only ',
    'reference the figures given. End with one motivating sentence.',
    '',
    `Context: ${JSON.stringify({ profile, insights })}`,
  ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API responded with status ${response.status}`);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim();

  if (!text) throw new Error('Anthropic API returned an empty response');
  return text;
}

module.exports = { narrateInsights };
