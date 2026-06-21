import { api } from './api.js';
import { renderGauge, renderCategoryBars } from './charts.js';

const STORAGE_KEY = 'carbonpulse_user_id';

const COUNTRY_LABELS = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', DE: 'Germany',
  CN: 'China', AU: 'Australia', BR: 'Brazil', CA: 'Canada', FR: 'France',
  JP: 'Japan', ZA: 'South Africa',
};

const QUANTITY_LABELS = {
  transport: 'Distance traveled (km)',
  flight: 'Distance traveled (km)',
  food: 'Number of meals',
  energy: 'Electricity used (kWh)',
  shopping: 'Amount spent ($)',
  waste: 'Weight (kg)',
};

const TYPE_LABELS = {
  walk: 'Walk', bike: 'Bike', ev: 'Electric vehicle', public_transit: 'Public transit',
  carpool: 'Carpool', motorbike: 'Motorbike', petrol_car: 'Petrol car', diesel_car: 'Diesel car',
  short_haul: 'Short-haul', long_haul: 'Long-haul',
  vegan: 'Vegan meal', vegetarian: 'Vegetarian meal', pescatarian: 'Pescatarian meal',
  omnivore: 'Omnivore meal', heavy_meat: 'Meat-heavy meal',
  clothing: 'Clothing', electronics: 'Electronics', general: 'General goods', furniture: 'Furniture',
  landfill: 'Landfill', recycled: 'Recycled', composted: 'Composted',
  grid: 'Grid (standard)', renewable: 'Renewable / solar',
};

const state = {
  userId: localStorage.getItem(STORAGE_KEY) || null,
  profile: null,
  factors: null,
};

// ---------------------------------------------------------------------------
// Bootstrapping
// ---------------------------------------------------------------------------

async function init() {
  state.factors = await api.getEmissionFactors();
  populateCountrySelect();
  populateSimValueOptions();
  wireOnboardingForm();
  wireLogForm();
  wireSimulateForm();
  wireTabs();
  wireReset();

  if (state.userId) {
    try {
      state.profile = await api.getUser(state.userId);
      enterApp();
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      state.userId = null;
      showOnboarding();
    }
  } else {
    showOnboarding();
  }
}

function showOnboarding() {
  setVisible('view-onboarding', true);
  document.getElementById('main-tabs').hidden = true;
  document.getElementById('reset-btn').hidden = true;
}

async function enterApp() {
  setVisible('view-onboarding', false);
  document.getElementById('main-tabs').hidden = false;
  document.getElementById('reset-btn').hidden = false;
  document.getElementById('dash-name').textContent = state.profile.name || 'there';
  switchTab('dashboard');
}

function setVisible(id, visible) {
  document.getElementById(id).hidden = !visible;
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

function populateCountrySelect() {
  const select = document.getElementById('f-country');
  for (const code of state.factors.countryCodes) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = COUNTRY_LABELS[code] || code;
    select.appendChild(option);
  }
}

function wireOnboardingForm() {
  const form = document.getElementById('onboarding-form');
  const errorEl = document.getElementById('onboarding-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    const payload = {
      name: data.get('name'),
      countryCode: data.get('countryCode'),
      householdSize: Number(data.get('householdSize')),
      dietType: data.get('dietType'),
      primaryTransport: data.get('primaryTransport'),
      commuteKmPerWeek: Number(data.get('commuteKmPerWeek')),
      homeEnergySource: data.get('homeEnergySource'),
      monthlyKwh: Number(data.get('monthlyKwh')),
      flightsShortHaulPerYear: Number(data.get('flightsShortHaulPerYear')),
      flightsLongHaulPerYear: Number(data.get('flightsLongHaulPerYear')),
    };

    try {
      const user = await api.createUser(payload);
      state.userId = user.id;
      state.profile = user;
      localStorage.setItem(STORAGE_KEY, user.id);
      await enterApp();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Tabs / view routing
// ---------------------------------------------------------------------------

function wireTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.view));
  });
}

async function switchTab(view) {
  document.querySelectorAll('.tab').forEach((btn) => {
    const isActive = btn.dataset.view === view;
    btn.toggleAttribute('aria-current', isActive);
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  ['dashboard', 'log', 'insights', 'simulate'].forEach((v) => setVisible(`view-${v}`, v === view));

  if (view === 'dashboard') await loadDashboard();
  if (view === 'log') await loadActivityList();
  if (view === 'insights') await loadInsights();
}

function wireReset() {
  document.getElementById('reset-btn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function loadDashboard() {
  const summary = await api.getSummary(state.userId);
  const { totals, topCategory, trend } = summary;

  renderGauge(document.getElementById('footprint-gauge'), {
    valueTonnes: totals.annualTonnes,
    benchmarkTonnes: totals.benchmarkTonnes,
    targetTonnes: totals.parisAlignedTargetTonnes,
  });

  const direction = totals.vsBenchmarkPct <= 0 ? 'below' : 'above';
  document.getElementById('benchmark-line').textContent =
    `${Math.abs(totals.vsBenchmarkPct)}% ${direction} your country's average (${totals.benchmarkTonnes} t/yr)`;

  renderCategoryBars(document.getElementById('category-bars'), totals.perCategoryMonthlyKg, topCategory);

  const banner = document.getElementById('trend-banner');
  banner.textContent = trend.message;
  banner.classList.toggle('trend-up', trend.direction === 'up');
}

// ---------------------------------------------------------------------------
// Log activity
// ---------------------------------------------------------------------------

function currentTypeOptionsFor(category) {
  if (category === 'transport') return Object.keys(state.factors.transport);
  if (category === 'flight') return Object.keys(state.factors.flight);
  if (category === 'food') return Object.keys(state.factors.food);
  if (category === 'shopping') return Object.keys(state.factors.shopping);
  if (category === 'waste') return Object.keys(state.factors.waste);
  return [];
}

function updateLogFormForCategory(category) {
  const typeField = document.getElementById('log-type-field');
  const typeSelect = document.getElementById('log-type');
  const quantityLabel = document.getElementById('log-quantity-label');

  quantityLabel.textContent = QUANTITY_LABELS[category] || 'Quantity';

  if (category === 'energy') {
    typeField.hidden = true;
    typeSelect.removeAttribute('required');
    ensureRenewableCheckbox();
  } else {
    typeField.hidden = false;
    typeSelect.setAttribute('required', 'required');
    removeRenewableCheckbox();
    typeSelect.innerHTML = '';
    for (const key of currentTypeOptionsFor(category)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = TYPE_LABELS[key] || key;
      typeSelect.appendChild(option);
    }
  }
}

function ensureRenewableCheckbox() {
  if (document.getElementById('log-renewable-field')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  wrapper.id = 'log-renewable-field';
  wrapper.innerHTML = `
    <label for="log-renewable">Was this from a renewable / off-grid source?</label>
    <select id="log-renewable" name="renewable">
      <option value="false" selected>No - standard grid</option>
      <option value="true">Yes - renewable</option>
    </select>`;
  document.getElementById('log-type-field').after(wrapper);
}

function removeRenewableCheckbox() {
  document.getElementById('log-renewable-field')?.remove();
}

function wireLogForm() {
  const categorySelect = document.getElementById('log-category');
  updateLogFormForCategory(categorySelect.value);
  categorySelect.addEventListener('change', () => updateLogFormForCategory(categorySelect.value));

  const form = document.getElementById('log-form');
  const errorEl = document.getElementById('log-error');
  const successEl = document.getElementById('log-success');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    successEl.hidden = true;

    const category = categorySelect.value;
    const quantity = Number(document.getElementById('log-quantity').value);
    const payload = { category, quantity };

    if (category === 'energy') {
      const renewableSelect = document.getElementById('log-renewable');
      payload.meta = { renewable: renewableSelect?.value === 'true' };
    } else {
      payload.type = document.getElementById('log-type').value;
    }

    try {
      await api.logActivity(state.userId, payload);
      successEl.textContent = 'Logged. Your dashboard will reflect this on next visit.';
      successEl.hidden = false;
      document.getElementById('log-quantity').value = '';
      await loadActivityList();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

async function loadActivityList() {
  const list = document.getElementById('activity-log-list');
  const activities = await api.getActivities(state.userId);
  list.innerHTML = '';

  if (activities.length === 0) {
    list.innerHTML = '<li class="empty-state">Nothing logged yet - your dashboard is using your onboarding baseline.</li>';
    return;
  }

  for (const activity of activities.slice(0, 8)) {
    const li = document.createElement('li');
    const date = new Date(activity.loggedAt).toLocaleDateString();
    const typeText = activity.type ? TYPE_LABELS[activity.type] || activity.type : 'Home energy';
    li.innerHTML = `
      <span class="activity-meta">${date} · ${activity.category} · ${typeText} · ${activity.quantity}</span>
      <span class="activity-co2">${activity.co2eKg} kg CO2e</span>`;
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

async function loadInsights() {
  const data = await api.getInsights(state.userId);
  document.getElementById('insight-narrative').textContent = data.narrative;

  const list = document.getElementById('recommendation-list');
  list.innerHTML = '';

  if (data.recommendations.length === 0) {
    list.innerHTML = '<li class="empty-state">No specific recommendations right now - your footprint already looks efficient across the board.</li>';
    return;
  }

  for (const rec of data.recommendations) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="rec-head">
        <h3>${rec.priority}. ${rec.title}</h3>
        <span class="rec-savings">~${rec.estAnnualSavingsKg} kg CO2e / yr</span>
      </div>
      <p class="rec-rationale">${rec.rationale}</p>
      <div class="rec-tags">
        <span class="rec-tag">${rec.category}</span>
        <span class="rec-tag">${rec.difficulty}</span>
      </div>`;
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

function populateSimValueOptions() {
  const fieldSelect = document.getElementById('sim-field');
  const valueSelect = document.getElementById('sim-value');

  const optionsFor = (field) => {
    if (field === 'primaryTransport') return Object.keys(state.factors.transport);
    if (field === 'dietType') return Object.keys(state.factors.food);
    if (field === 'homeEnergySource') return ['grid', 'renewable'];
    return [];
  };

  const refresh = () => {
    valueSelect.innerHTML = '';
    for (const key of optionsFor(fieldSelect.value)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = TYPE_LABELS[key] || key;
      valueSelect.appendChild(option);
    }
  };

  fieldSelect.addEventListener('change', refresh);
  refresh();
}

function wireSimulateForm() {
  const form = document.getElementById('simulate-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const field = document.getElementById('sim-field').value;
    const value = document.getElementById('sim-value').value;

    const result = await api.simulate(state.userId, { field, value });
    const resultEl = document.getElementById('simulate-result');
    resultEl.hidden = false;
    resultEl.classList.toggle('is-negative', result.annualSavingsKg < 0);

    const verb = result.annualSavingsKg >= 0 ? 'save' : 'add';
    resultEl.innerHTML = `
      <p>Switching <strong>${TYPE_LABELS[result.from] || result.from}</strong> &rarr; <strong>${TYPE_LABELS[result.to] || result.to}</strong>:</p>
      <p class="big-number">${Math.abs(result.annualSavingsKg).toFixed(0)} kg CO2e / yr</p>
      <p>That's a projected ${verb} of ${Math.abs(result.annualSavingsPct)}%, taking you from ${result.currentAnnualTonnes} t/yr to ${result.projectedAnnualTonnes} t/yr.</p>`;
  });
}

init();
