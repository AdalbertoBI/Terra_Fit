import {
  formatMl,
  formatCups,
  todayKey,
  getMotivationMessage,
  isNotificationSupported
} from './utils.js';
import {
  getProfile,
  saveProfile,
  getSettings,
  saveSettings,
  getHistory,
  addConsumption,
  resetDay,
  getWeeklyHistory,
  getSteps,
  incrementSteps,
  resetSteps as resetStoredSteps
} from './storage.js';
import { calculateDailyNeed, calculateProgress } from './calculations.js';
import {
  requestNotificationPermission,
  isPermissionGranted,
  startReminderLoop,
  stopReminderLoop,
  showHydrationNotification
} from './notifications.js';
import { renderWeeklyChart } from './chart.js';

let profile = getProfile();
let settings = getSettings();
let dailyNeed = calculateDailyNeed(profile);

const profileForm = document.getElementById('profileForm');
const reminderIntervalInput = document.getElementById('reminderInterval');
const drinkAmountInput = document.getElementById('drinkAmount');
const requestNotificationsBtn = document.getElementById('requestNotifications');
const reminderStatus = document.getElementById('reminderStatus');
const drinkNowBtn = document.getElementById('drinkNow');
const resetProgressBtn = document.getElementById('resetProgress');
const dailyNeedEl = document.getElementById('dailyNeed');
const cupsCountEl = document.getElementById('cupsCount');
const consumedTodayEl = document.getElementById('consumedToday');
const progressBarEl = document.getElementById('progressBar');
const motivationMessageEl = document.getElementById('motivationMessage');
const historyListEl = document.getElementById('historyList');
const weeklyChartCanvas = document.getElementById('weeklyChart');
const themeToggle = document.getElementById('themeToggle');
const connectWatchBtn = document.getElementById('connectWatch');
const watchStatus = document.getElementById('watchStatus');
const stepsCountEl = document.getElementById('stepsCount');
const stepsStatusEl = document.getElementById('stepsStatus');
const startStepsBtn = document.getElementById('startSteps');
const resetStepsBtn = document.getElementById('resetSteps');

let currentDayKey = todayKey();
let stepCount = getSteps(currentDayKey);
let isStepCounterActive = false;
let lastMagnitude = null;
let lastStepTimestamp = 0;
const STEP_THRESHOLD = 1.4;
const STEP_INTERVAL = 450; // ms
let dayWatcher = null;

function init() {
  populateProfileForm();
  populateSettings();
  applyTheme(settings.theme);
  updateDailyNeeds();
  updateHistoryUI();
  updateStepUI();
  setupEventListeners();
  registerServiceWorker();
  scheduleReminders();
  startDayWatcher();
}

function populateProfileForm() {
  profileForm.name.value = profile.name;
  profileForm.age.value = profile.age;
  profileForm.sex.value = profile.sex;
  profileForm.weight.value = profile.weight;
  profileForm.height.value = profile.height;
  profileForm.activity.value = profile.activity;
}

function populateSettings() {
  reminderIntervalInput.value = settings.reminderInterval;
  drinkAmountInput.value = settings.drinkAmount;
}

function applyTheme(theme) {
  const body = document.body;
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  body.setAttribute('data-theme', resolvedTheme);
  settings = { ...settings, theme: resolvedTheme };
  saveSettings(settings);
  themeToggle.textContent = resolvedTheme === 'dark' ? '☀️' : '🌙';
}

function updateDailyNeeds() {
  dailyNeed = calculateDailyNeed(profile);
  const todayKeyValue = todayKey();
  const history = getHistory();
  const todayTotal = history[todayKeyValue]?.total || 0;

  dailyNeedEl.textContent = formatMl(dailyNeed.totalMl);
  cupsCountEl.textContent = formatCups(dailyNeed.cups);
  consumedTodayEl.textContent = formatMl(todayTotal);

  const progress = calculateProgress(todayTotal, dailyNeed.totalMl);
  progressBarEl.style.width = `${Math.min(progress, 100)}%`;
  progressBarEl.setAttribute('aria-valuenow', progress);
  progressBarEl.setAttribute('aria-valuemin', 0);
  progressBarEl.setAttribute('aria-valuemax', 100);
  motivationMessageEl.textContent = getMotivationMessage(progress);

  updateReminderStatus(progress);
  renderWeeklyChart(weeklyChartCanvas, getWeeklyHistory(), dailyNeed.totalMl);
}

function updateHistoryUI() {
  const history = getHistory();
  const entries = Object.keys(history)
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 7);

  historyListEl.innerHTML = '';

  if (!entries.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum registro ainda. Comece registrando sua ingestão de hoje!';
    historyListEl.appendChild(li);
    return;
  }

  entries.forEach(dateKey => {
    const item = history[dateKey];
    const li = document.createElement('li');
    const date = new Date(dateKey);
    const totalMl = formatMl(item.total);
    const formattedDate = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    li.innerHTML = `<span>${formattedDate}</span><span>${totalMl}</span>`;
    historyListEl.appendChild(li);
  });
}

function setupEventListeners() {
  profileForm.addEventListener('submit', handleProfileSubmit);
  reminderIntervalInput.addEventListener('change', handleReminderIntervalChange);
  drinkAmountInput.addEventListener('change', handleDrinkAmountChange);
  requestNotificationsBtn.addEventListener('click', handleNotificationRequest);
  drinkNowBtn.addEventListener('click', handleDrinkNow);
  resetProgressBtn.addEventListener('click', handleResetProgress);
  themeToggle.addEventListener('click', () => applyTheme(settings.theme === 'dark' ? 'light' : 'dark'));
  connectWatchBtn.addEventListener('click', handleWatchConnection);
  startStepsBtn.addEventListener('click', handleStartStepsToggle);
  resetStepsBtn.addEventListener('click', handleResetSteps);
}

function handleProfileSubmit(event) {
  event.preventDefault();
  const formData = new FormData(profileForm);
  const updatedProfile = Object.fromEntries(formData.entries());
  updatedProfile.weight = Number(updatedProfile.weight);
  updatedProfile.height = Number(updatedProfile.height);
  updatedProfile.age = Number(updatedProfile.age);

  profile = { ...profile, ...updatedProfile };
  saveProfile(profile);
  updateDailyNeeds();
  showHydrationNotification({ title: 'Perfil atualizado', body: 'Sua meta de hidratação foi recalculada.' });
}

function handleReminderIntervalChange(event) {
  const value = Number(event.target.value);
  settings = { ...settings, reminderInterval: value };
  saveSettings(settings);
  scheduleReminders();
}

function handleDrinkAmountChange(event) {
  const value = Number(event.target.value);
  settings = { ...settings, drinkAmount: value };
  saveSettings(settings);
}

async function handleNotificationRequest() {
  try {
    const granted = await requestNotificationPermission();
    if (granted) {
      scheduleReminders();
      reminderStatus.textContent = `Notificações ativas a cada ${settings.reminderInterval} minutos.`;
      showHydrationNotification({ body: 'Você receberá lembretes periódicos de hidratação.' });
    } else {
      reminderStatus.textContent = 'Permissão de notificações não concedida.';
    }
  } catch (error) {
    reminderStatus.textContent = error.message;
  }
}

function handleDrinkNow() {
  const amount = Number(settings.drinkAmount) || 200;
  const today = addConsumption(amount);
  consumedTodayEl.textContent = formatMl(today.total);
  updateDailyNeeds();
  updateHistoryUI();
}

function handleResetProgress() {
  resetDay();
  updateDailyNeeds();
  updateHistoryUI();
}

async function handleWatchConnection() {
  if (!navigator.bluetooth) {
    watchStatus.textContent = 'Bluetooth Web API não disponível neste dispositivo.';
    return;
  }

  try {
    watchStatus.textContent = 'Procurando dispositivos...';
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['device_information', 0x180D]
    });
    watchStatus.textContent = `Conectado a ${device.name || 'dispositivo sem nome'}.`;

    device.addEventListener('gattserverdisconnected', () => {
      watchStatus.textContent = 'Conexão perdida. Tente reconectar para manter a sincronização.';
    });
  } catch (error) {
    watchStatus.textContent = 'Não foi possível conectar. Verifique se o dispositivo está próximo e pareado.';
  }
}

function scheduleReminders() {
  stopReminderLoop();
  updateReminderStatus();

  if (!isNotificationSupported()) {
    reminderStatus.textContent = 'Este navegador não suporta notificações.';
    return;
  }

  if (!isPermissionGranted()) {
    reminderStatus.textContent = 'Permita notificações para ativar lembretes.';
    return;
  }

  const interval = Number(settings.reminderInterval);
  if (!interval) {
    reminderStatus.textContent = 'Defina um intervalo válido para iniciar lembretes.';
    return;
  }

  startReminderLoop(interval, () => {
    const today = getHistory()[todayKey()]?.total || 0;
    const progress = calculateProgress(today, dailyNeed.totalMl);
    if (progress >= 100) {
      return 'Parabéns! Meta diária alcançada. Hidrate-se ao longo do dia para manter o equilíbrio!';
    }
    return `Você atingiu ${progress}% da meta. Beba mais ${formatMl(Math.max(dailyNeed.totalMl - today, 0))}.`;
  });
  reminderStatus.textContent = `Notificações a cada ${interval} minutos.`;
}

function updateReminderStatus(progress = null) {
  if (!isNotificationSupported()) {
    reminderStatus.textContent = 'Notificações não suportadas neste dispositivo.';
    return;
  }

  if (!isPermissionGranted()) {
    reminderStatus.textContent = 'Permita notificações para receber lembretes.';
    return;
  }

  const interval = Number(settings.reminderInterval);
  if (!interval) {
    reminderStatus.textContent = 'Defina um intervalo de lembretes.';
    return;
  }

  if (typeof progress === 'number' && progress >= 100) {
    reminderStatus.textContent = 'Meta alcançada hoje! Continue hidratado. Lembretes continuam ativos.';
  } else {
    reminderStatus.textContent = `Notificações ativas a cada ${interval} minutos.`;
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.error('Falha ao registrar service worker', error);
    });
  }
}

function updateStepUI() {
  stepsCountEl.textContent = stepCount.toLocaleString('pt-BR');
  if (isStepCounterActive) {
    stepsStatusEl.textContent = 'Contador ativo. Movimente-se com segurança para registrar seus passos.';
    startStepsBtn.textContent = 'Pausar contador';
  } else {
    stepsStatusEl.textContent = 'Ative o contador para acompanhar seus passos e ajustar sua hidratação.';
    startStepsBtn.textContent = 'Iniciar contador';
  }
}

async function handleStartStepsToggle() {
  if (isStepCounterActive) {
    stopStepCounter();
    updateStepUI();
    return;
  }

  const permission = await requestMotionPermission();
  if (!permission) {
    stepsStatusEl.textContent = 'Permissão para sensores de movimento negada ou não disponível.';
    return;
  }

  if (!('DeviceMotionEvent' in window)) {
    stepsStatusEl.textContent = 'Sensores de movimento não suportados neste dispositivo.';
    return;
  }

  startStepCounter();
  updateStepUI();
}

function startStepCounter() {
  if (isStepCounterActive) return;
  isStepCounterActive = true;
  lastMagnitude = null;
  lastStepTimestamp = 0;
  window.addEventListener('devicemotion', handleDeviceMotion, true);
}

function stopStepCounter() {
  if (!isStepCounterActive) return;
  isStepCounterActive = false;
  window.removeEventListener('devicemotion', handleDeviceMotion, true);
}

function handleDeviceMotion(event) {
  if (!isStepCounterActive) return;
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;
  const magnitude = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);

  if (lastMagnitude === null) {
    lastMagnitude = magnitude;
    return;
  }

  const delta = Math.abs(magnitude - lastMagnitude);
  const now = Date.now();

  if (delta > STEP_THRESHOLD && now - lastStepTimestamp > STEP_INTERVAL) {
    lastStepTimestamp = now;
    stepCount = incrementSteps(1, todayKey());
    updateStepUI();
  }

  lastMagnitude = magnitude;
}

function handleResetSteps() {
  stepCount = 0;
  resetStoredSteps();
  updateStepUI();
}

async function requestMotionPermission() {
  if ('DeviceMotionEvent' in window && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      return result === 'granted';
    } catch (error) {
      return false;
    }
  }
  // Permissions API not required
  return true;
}

function startDayWatcher() {
  dayWatcher = setInterval(() => {
    const today = todayKey();
    if (today !== currentDayKey) {
      currentDayKey = today;
      stepCount = getSteps(currentDayKey);
      updateDailyNeeds();
      updateHistoryUI();
      updateStepUI();
    }
  }, 60 * 1000);
}

init();
