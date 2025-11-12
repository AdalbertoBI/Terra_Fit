import { loadJSON, saveJSON, todayKey } from './utils.js';

const STORAGE_KEYS = {
  profile: 'hidrate_plus_profile',
  settings: 'hidrate_plus_settings',
  history: 'hidrate_plus_history',
  steps: 'hidrate_plus_steps'
};

const DEFAULT_PROFILE = {
  name: '',
  age: 25,
  sex: '',
  weight: 70,
  height: 170,
  activity: 'sedentario'
};

const DEFAULT_SETTINGS = {
  reminderInterval: 60,
  drinkAmount: 200,
  startTime: '06:00',
  endTime: '21:00',
  theme: 'light'
};

export function getProfile() {
  return { ...DEFAULT_PROFILE, ...loadJSON(STORAGE_KEYS.profile, {}) };
}

export function saveProfile(profile) {
  saveJSON(STORAGE_KEYS.profile, profile);
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...loadJSON(STORAGE_KEYS.settings, {}) };
}

export function saveSettings(settings) {
  saveJSON(STORAGE_KEYS.settings, settings);
}

export function getHistory() {
  return loadJSON(STORAGE_KEYS.history, {});
}

export function saveHistory(history) {
  saveJSON(STORAGE_KEYS.history, history);
}

export function getStepsHistory() {
  return loadJSON(STORAGE_KEYS.steps, {});
}

export function saveStepsHistory(history) {
  saveJSON(STORAGE_KEYS.steps, history);
}

export function getSteps(dateKey = todayKey()) {
  const history = getStepsHistory();
  return history[dateKey] || 0;
}

export function setSteps(value, dateKey = todayKey()) {
  const history = getStepsHistory();
  history[dateKey] = value;
  saveStepsHistory(history);
  return value;
}

export function incrementSteps(amount = 1, dateKey = todayKey()) {
  const history = getStepsHistory();
  const current = history[dateKey] || 0;
  history[dateKey] = current + amount;
  saveStepsHistory(history);
  return history[dateKey];
}

export function resetSteps(dateKey = todayKey()) {
  const history = getStepsHistory();
  history[dateKey] = 0;
  saveStepsHistory(history);
}

export function addConsumption(amount, dateKey = todayKey()) {
  const history = getHistory();
  if (!history[dateKey]) {
    history[dateKey] = {
      total: 0,
      entries: []
    };
  }

  history[dateKey].total += amount;
  history[dateKey].entries.push({
    amount,
    timestamp: new Date().toISOString()
  });

  saveHistory(history);
  return history[dateKey];
}

export function resetDay(dateKey = todayKey()) {
  const history = getHistory();
  if (history[dateKey]) {
    history[dateKey] = {
      total: 0,
      entries: []
    };
    saveHistory(history);
  }
}

export function getWeeklyHistory(referenceDate = new Date()) {
  const history = getHistory();
  const days = [];
  const date = new Date(referenceDate);

  for (let i = 6; i >= 0; i--) {
    const day = new Date(date);
    day.setDate(date.getDate() - i);
    const key = day.toISOString().split('T')[0];
    days.push({
      key,
      total: history[key]?.total || 0
    });
  }

  return days;
}
