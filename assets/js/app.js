import {
  formatMl,
  formatCups,
  todayKey,
  getMotivationMessage,
  isNotificationSupported,
  loadJSON,
  saveJSON
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
const installBanner = document.getElementById('installBanner');
const installButton = document.getElementById('installApp');
const dismissInstallButton = document.getElementById('dismissInstall');
const installBannerTitle = document.querySelector('.install-banner__title');
const installBannerText = document.querySelector('.install-banner__text');

const INSTALL_STATE_KEY = 'hidrate_plus_install_state';
const INSTALL_DISMISS_TIMEOUT = 1000 * 60 * 60 * 24 * 3; // 3 dias

let installState = {
  dismissedAt: null,
  installed: false,
  ...loadJSON(INSTALL_STATE_KEY, {})
};
let deferredInstallPrompt = null;

let currentDayKey = todayKey();
let stepCount = getSteps(currentDayKey);
let isStepCounterActive = false;
let lastMagnitude = null;
let lastStepTimestamp = 0;
const STEP_THRESHOLD = 1.4;
const STEP_INTERVAL = 450; // ms
let dayWatcher = null;
let initialController = null;
let swRefreshing = false;
let updateToastElement = null;
let updateReloadTimeout = null;

function init() {
  populateProfileForm();
  populateSettings();
  applyTheme(settings.theme);
  updateDailyNeeds();
  updateHistoryUI();
  updateStepUI();
  setupEventListeners();
  setupInstallPrompt();
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

function setupInstallPrompt() {
  if (!installBanner) return;

  if (installButton) {
    installButton.addEventListener('click', handleInstallClick);
  }

  if (dismissInstallButton) {
    dismissInstallButton.addEventListener('click', () => hideInstallBanner({ dismiss: true }));
  }

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);

  const displayModeMedia = window.matchMedia('(display-mode: standalone)');
  if (displayModeMedia?.addEventListener) {
    displayModeMedia.addEventListener('change', event => {
      if (event.matches) {
        markInstalled();
      }
    });
  } else if (displayModeMedia?.addListener) {
    displayModeMedia.addListener(event => {
      if (event.matches) {
        markInstalled();
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldShowInstallBanner()) {
      showInstallBanner();
    }
  });

  if (isStandalone()) {
    markInstalled();
    return;
  }

  if (shouldShowInstallBanner()) {
    setTimeout(() => {
      if (shouldShowInstallBanner()) {
        showInstallBanner();
      }
    }, 1600);
  }
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  installState.dismissedAt = null;
  saveInstallState();
  if (shouldShowInstallBanner()) {
    showInstallBanner();
  }
}

async function handleInstallClick() {
  if (!installButton) return;

  if (deferredInstallPrompt) {
    installButton.disabled = true;
    try {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        markInstalled();
      } else {
        hideInstallBanner({ dismiss: true, immediate: true });
      }
    } catch (error) {
      console.error('Não foi possível exibir o prompt de instalação', error);
    } finally {
      installButton.disabled = false;
      deferredInstallPrompt = null;
    }
  } else if (isIos()) {
    hideInstallBanner({ dismiss: true, immediate: false });
  } else {
    hideInstallBanner({ dismiss: true, immediate: false });
  }
}

function handleAppInstalled() {
  markInstalled();
  hideInstallBanner({ immediate: true });
}

function showInstallBanner() {
  if (!installBanner || installBanner.classList.contains('visible') || !shouldShowInstallBanner()) return;
  updateInstallCopy();
  installBanner.setAttribute('aria-hidden', 'false');
  if (typeof installBanner.show === 'function') {
    if (!installBanner.open) {
      installBanner.show();
    }
  } else {
    installBanner.setAttribute('open', '');
  }
  requestAnimationFrame(() => installBanner.classList.add('visible'));
}

function hideInstallBanner({ dismiss = false, immediate = false } = {}) {
  if (!installBanner) return;
  installBanner.classList.remove('visible');
  installBanner.setAttribute('aria-hidden', 'true');

  const finalize = () => {
    if (typeof installBanner.close === 'function') {
      if (installBanner.open) installBanner.close();
    } else if (installBanner.hasAttribute('open')) {
      installBanner.removeAttribute('open');
    }
  };

  if (immediate) {
    finalize();
  } else {
    setTimeout(finalize, 280);
  }

  if (dismiss) {
    installState.dismissedAt = Date.now();
    saveInstallState();
  }
}

function updateInstallCopy() {
  if (!installBannerTitle || !installBannerText || !installButton) return;

  if (deferredInstallPrompt) {
    installBannerTitle.textContent = 'Instale o Hidrate+';
    installBannerText.textContent = 'Acesse mais rápido e receba lembretes mesmo offline.';
    installButton.textContent = 'Instalar agora';
    installButton.disabled = false;
  } else if (isIos()) {
    installBannerTitle.textContent = 'Instale na Tela de Início';
    installBannerText.textContent = 'No Safari, toque em Compartilhar e escolha "Adicionar à Tela de Início".';
    installButton.textContent = 'OK, entendi';
    installButton.disabled = false;
  } else {
    installBannerTitle.textContent = 'Instale o Hidrate+';
    installBannerText.textContent = 'Use seu navegador para adicionar o app à tela inicial.';
    installButton.textContent = 'Fechar';
    installButton.disabled = false;
  }
}

function shouldShowInstallBanner() {
  if (!installBanner || document.visibilityState !== 'visible') return false;
  if (isStandalone()) return false;
  if (installState.installed) return false;
  if (installState.dismissedAt) {
    const elapsed = Date.now() - installState.dismissedAt;
    if (elapsed < INSTALL_DISMISS_TIMEOUT) {
      return false;
    }
  }
  return true;
}

function markInstalled() {
  installState.installed = true;
  installState.dismissedAt = null;
  saveInstallState();
  hideInstallBanner({ immediate: true });
}

function saveInstallState() {
  saveJSON(INSTALL_STATE_KEY, installState);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
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
  if (!('serviceWorker' in navigator)) {
    return;
  }

  initialController = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
  navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

  navigator.serviceWorker
    .register('./service-worker.js')
    .then(registration => {
      if (registration.waiting) {
        requestServiceWorkerSkipWaiting(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            requestServiceWorkerSkipWaiting(newWorker);
          }
        });
      });
    })
    .catch(error => {
      console.error('Falha ao registrar service worker', error);
    });
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

function handleControllerChange() {
  if (!initialController) {
    initialController = navigator.serviceWorker.controller;
    return;
  }

  if (swRefreshing) {
    return;
  }

  swRefreshing = true;
  showUpdateToast();
}

function handleServiceWorkerMessage(event) {
  if (!event.data || !event.data.type) return;
  if (['CACHE_UPDATED', 'SW_UPDATED'].includes(event.data.type)) {
    showUpdateToast();
  }
}

function requestServiceWorkerSkipWaiting(worker) {
  if (!worker || worker.state === 'redundant') {
    return;
  }

  try {
    worker.postMessage({ type: 'SKIP_WAITING' });
  } catch (error) {
    console.error('Não foi possível sinalizar skipWaiting para o service worker', error);
  }
}

function showUpdateToast() {
  if (updateToastElement) {
    if (!updateReloadTimeout) {
      updateReloadTimeout = setTimeout(() => window.location.reload(), 6000);
    }
    return;
  }

  updateToastElement = document.createElement('div');
  updateToastElement.className = 'update-toast';
  updateToastElement.setAttribute('role', 'status');
  updateToastElement.setAttribute('aria-live', 'polite');
  updateToastElement.innerHTML = `
    <span><strong>Atualização pronta.</strong> O app será recarregado para aplicar melhorias.</span>
    <button type="button" class="update-toast__action">Atualizar agora</button>
  `;

  document.body.appendChild(updateToastElement);

  const actionButton = updateToastElement.querySelector('.update-toast__action');
  const reload = () => {
    if (updateReloadTimeout) {
      clearTimeout(updateReloadTimeout);
    }
    window.location.reload();
  };

  if (actionButton) {
    actionButton.addEventListener('click', reload, { once: true });
  }

  updateReloadTimeout = setTimeout(reload, 6000);
}

init();
