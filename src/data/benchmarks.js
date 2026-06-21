/**
 * Per-capita annual carbon footprint benchmarks, in tonnes CO2e/year.
 *
 * These are widely-cited ballpark national averages used purely to give the
 * user *context* ("you're tracking above/below your country's average") -
 * they are not precise and intentionally err toward round numbers.
 */
const ANNUAL_PER_CAPITA_TONNES = {
  global: 4.7,
  IN: 1.9,
  US: 14.7,
  GB: 5.5,
  DE: 8.1,
  CN: 7.4,
  AU: 15.4,
  BR: 2.3,
  CA: 14.2,
  FR: 4.6,
  JP: 8.5,
  ZA: 6.9,
  default: 4.7,
};

// A widely-referenced target consistent with limiting warming well below 2°C.
const PARIS_ALIGNED_TARGET_TONNES = 2.0;

function getBenchmark(countryCode) {
  return ANNUAL_PER_CAPITA_TONNES[countryCode] || ANNUAL_PER_CAPITA_TONNES.default;
}

module.exports = {
  ANNUAL_PER_CAPITA_TONNES,
  PARIS_ALIGNED_TARGET_TONNES,
  getBenchmark,
};
