/**
 * Emission factor reference data.
 *
 * IMPORTANT (see README "Assumptions"): these values are simplified,
 * illustrative approximations assembled from widely-published sustainability
 * references (IPCC-style averages, national grid disclosures, common
 * lifecycle-assessment ranges). They are intentionally rounded for a
 * decision-support tool, NOT a regulatory-grade carbon audit. Swap this file
 * out for a licensed factor database if this were taken to production.
 *
 * All factors are expressed in kilograms of CO2-equivalent (kg CO2e).
 */

const TRANSPORT_KG_PER_KM = {
  walk: 0,
  bike: 0,
  ev: 0.06,
  public_transit: 0.1,
  carpool: 0.09,
  motorbike: 0.1,
  petrol_car: 0.19,
  diesel_car: 0.17,
};

const FLIGHT_KG_PER_KM = {
  short_haul: 0.15, // < ~1500km, less fuel-efficient per km
  long_haul: 0.11,
};

const FOOD_KG_PER_MEAL = {
  vegan: 0.5,
  vegetarian: 0.8,
  pescatarian: 1.5,
  omnivore: 2.5,
  heavy_meat: 4.5,
};

// kg CO2e per kWh of grid electricity, by ISO-3166 country code.
const ENERGY_GRID_KG_PER_KWH = {
  IN: 0.82,
  US: 0.42,
  GB: 0.23,
  DE: 0.38,
  CN: 0.62,
  AU: 0.66,
  BR: 0.09,
  CA: 0.13,
  FR: 0.06,
  JP: 0.47,
  ZA: 0.9,
  default: 0.48,
};

// Rough lifecycle-emissions intensity per $100 of spend, by goods category.
const SHOPPING_KG_PER_100_SPEND = {
  clothing: 22,
  electronics: 38,
  general: 15,
  furniture: 28,
};

const WASTE_KG_PER_KG = {
  landfill: 0.58,
  recycled: 0.12,
  composted: 0.05,
};

// Renewable home energy still carries a small embodied/maintenance factor.
const RENEWABLE_KG_PER_KWH = 0.02;

function listCountryCodes() {
  return Object.keys(ENERGY_GRID_KG_PER_KWH).filter((c) => c !== 'default');
}

module.exports = {
  TRANSPORT_KG_PER_KM,
  FLIGHT_KG_PER_KM,
  FOOD_KG_PER_MEAL,
  ENERGY_GRID_KG_PER_KWH,
  SHOPPING_KG_PER_100_SPEND,
  WASTE_KG_PER_KG,
  RENEWABLE_KG_PER_KWH,
  listCountryCodes,
};
