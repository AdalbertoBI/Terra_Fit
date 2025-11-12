import {
  formatMl,
  todayKey,
  getMotivationMessage,
  isNotificationSupported,
  loadJSON,
  saveJSON,
  clamp
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
  configureReminderSchedule,
  cancelReminderSchedule,
  showHydrationNotification
} from './notifications.js';
import { renderWeeklyChart } from './chart.js';

let profile = getProfile();
let settings = getSettings();

let settingsChanged = false;
if (!settings.startTime) {
  settings.startTime = '06:00';
  settingsChanged = true;
}
if (!settings.endTime) {
  settings.endTime = '21:00';
  settingsChanged = true;
}
if (settingsChanged) {
  saveSettings(settings);
}
let dailyNeed = calculateDailyNeed(profile);

const profileForm = document.getElementById('profileForm');
const reminderIntervalInput = document.getElementById('reminderInterval');
const drinkAmountInput = document.getElementById('drinkAmount');
const reminderStartInput = document.getElementById('reminderStart');
const reminderEndInput = document.getElementById('reminderEnd');
const requestNotificationsBtn = document.getElementById('requestNotifications');
const reminderStatus = document.getElementById('reminderStatus');
const drinkNowBtn = document.getElementById('drinkNow');
const resetProgressBtn = document.getElementById('resetProgress');
const quickAddList = document.getElementById('quickAddList');
const customLogForm = document.getElementById('customLogForm');
const customAmountInput = document.getElementById('customAmount');
const dailyNeedEl = document.getElementById('dailyNeed');
const dailyNeedHelperEl = document.getElementById('dailyNeedHelper');
const portionValueEl = document.getElementById('portionValue');
const portionHelperEl = document.getElementById('portionHelper');
const consumedTodayEl = document.getElementById('consumedToday');
const progressBarEl = document.getElementById('progressBar');
const dailySessionsEl = document.getElementById('dailySessions');
const sessionsRemainingEl = document.getElementById('sessionsRemaining');
const sessionsCompletedEl = document.getElementById('sessionsCompleted');
const remainingMlEl = document.getElementById('remainingMl');
const lastDrinkTimeEl = document.getElementById('lastDrinkTime');
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
const nextReminderTimeEl = document.getElementById('nextReminderTime');
const nextReminderCountdownEl = document.getElementById('nextReminderCountdown');

const baseDocumentTitle = document.title || 'Hidrate+';

const INSTALL_STATE_KEY = 'hidrate_plus_install_state';
const INSTALL_DISMISS_TIMEOUT = 1000 * 60 * 60 * 24 * 3; // 3 dias
const QUICK_ADD_PRESETS = [150, 200, 250, 300, 500];

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
let currentProgress = 0;
let lastCountdownState = null;
let lastRecordedAmount = Number(settings.drinkAmount) || 200;
let lastDailySummary = {
  todayTotal: 0,
  drinkAmount: Number(settings.drinkAmount) || 200,
  recommendedSessions: 0,
  completedSessions: 0,
  remainingVolume: 0,
  remainingSessions: 0
};

function init() {
  populateProfileForm();
  populateSettings();
  applyTheme(settings.theme);
  const todayEntries = getHistory()[todayKey()]?.entries || [];
  if (todayEntries.length) {
    const lastEntry = todayEntries[todayEntries.length - 1];
    if (lastEntry?.amount) {
      lastRecordedAmount = Number(lastEntry.amount);
    }
  }
  updateDailyNeeds();
  updateHistoryUI();
  updateStepUI();
  setupEventListeners();
  setupInstallPrompt();
  updateCountdownUI();
  registerServiceWorker();
  scheduleReminders();
  startDayWatcher();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      document.title = baseDocumentTitle;
    }
  });
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
  if (reminderStartInput) {
    reminderStartInput.value = settings.startTime || '06:00';
  }
  if (reminderEndInput) {
    reminderEndInput.value = settings.endTime || '21:00';
  }
  if (customAmountInput) {
    customAmountInput.value = settings.drinkAmount;
    customAmountInput.placeholder = formatMl(settings.drinkAmount);
    delete customAmountInput.dataset.userEdited;
  }
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
  const drinkAmount = Math.max(Number(settings.drinkAmount) || 0, 1);
  const recommendedSessions = Math.max(1, Math.ceil(dailyNeed.totalMl / drinkAmount));
  const completedSessions = Math.floor(todayTotal / drinkAmount);
  const remainingVolume = Math.max(dailyNeed.totalMl - todayTotal, 0);
  const remainingSessions = remainingVolume > 0 ? Math.ceil(remainingVolume / drinkAmount) : 0;
  const lastEntry = history[todayKeyValue]?.entries?.slice(-1)[0];

  lastDailySummary = {
    todayTotal,
    drinkAmount,
    recommendedSessions,
    completedSessions,
    remainingVolume,
    remainingSessions
  };

  dailyNeedEl.textContent = formatMl(dailyNeed.totalMl);
  if (dailyNeedHelperEl) {
    dailyNeedHelperEl.textContent = `Equivalente a ${recommendedSessions.toLocaleString('pt-BR')} doses de ${formatMl(drinkAmount)}.`;
  }

  if (portionValueEl) {
    portionValueEl.textContent = formatMl(drinkAmount);
  }
  if (portionHelperEl) {
    portionHelperEl.textContent = `Cada registro adiciona ${formatMl(drinkAmount)} à sua meta.`;
  }

  if (drinkNowBtn) {
    drinkNowBtn.textContent = `Registrar ${formatMl(drinkAmount)}`;
    drinkNowBtn.setAttribute('aria-label', `Registrar ${formatMl(drinkAmount)} agora`);
  }

  renderQuickAddButtons(drinkAmount, lastRecordedAmount || drinkAmount);

  if (customAmountInput) {
    customAmountInput.placeholder = formatMl(drinkAmount);
    if (!customAmountInput.dataset.userEdited) {
      customAmountInput.value = drinkAmount;
    }
  }

  if (dailySessionsEl) {
    dailySessionsEl.textContent = recommendedSessions.toLocaleString('pt-BR');
  }
  if (sessionsRemainingEl) {
    sessionsRemainingEl.textContent = remainingSessions.toLocaleString('pt-BR');
  }

  consumedTodayEl.textContent = formatMl(todayTotal);
  if (remainingMlEl) {
    remainingMlEl.textContent = formatMl(remainingVolume);
  }
  if (sessionsCompletedEl) {
    sessionsCompletedEl.textContent = completedSessions.toLocaleString('pt-BR');
  }
  if (lastDrinkTimeEl) {
    lastDrinkTimeEl.textContent = lastEntry ? formatRelativeTime(lastEntry.timestamp) : '--';
  }

  const progress = calculateProgress(todayTotal, dailyNeed.totalMl);
  currentProgress = progress;
  progressBarEl.style.width = `${Math.min(progress, 100)}%`;
  progressBarEl.setAttribute('aria-valuenow', progress);
  progressBarEl.setAttribute('aria-valuemin', 0);
  progressBarEl.setAttribute('aria-valuemax', 100);
  motivationMessageEl.textContent = getMotivationMessage(progress);
  renderWeeklyChart(weeklyChartCanvas, getWeeklyHistory(), dailyNeed.totalMl);
    updateReminderStatus(lastCountdownState);
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
  if (reminderStartInput) {
    reminderStartInput.addEventListener('change', handleReminderStartChange);
  }
  if (reminderEndInput) {
    reminderEndInput.addEventListener('change', handleReminderEndChange);
  }
  requestNotificationsBtn.addEventListener('click', handleNotificationRequest);
  drinkNowBtn.addEventListener('click', handleDrinkNow);
  resetProgressBtn.addEventListener('click', handleResetProgress);
  if (quickAddList) {
    quickAddList.addEventListener('click', handleQuickAddClick);
  }
  if (customLogForm) {
    customLogForm.addEventListener('submit', handleCustomLogSubmit);
  }
  if (customAmountInput) {
    const markEdited = () => {
      customAmountInput.dataset.userEdited = 'true';
    };
    customAmountInput.addEventListener('input', markEdited);
    customAmountInput.addEventListener('focus', markEdited);
  }
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
  scheduleReminders();
  showHydrationNotification({ title: 'Perfil atualizado', body: 'Sua meta de hidratação foi recalculada.' });
}

function handleReminderIntervalChange(event) {
  const value = Number(event.target.value);
  settings = { ...settings, reminderInterval: value };
  saveSettings(settings);
  scheduleReminders();
}

function handleDrinkAmountChange(event) {
  const min = Number(drinkAmountInput.min) || 50;
  const max = Number(drinkAmountInput.max) || 1000;
  const value = Number(event.target.value);
  const sanitized = clamp(value, min, max);
  drinkAmountInput.value = sanitized;
  settings = { ...settings, drinkAmount: sanitized };
  saveSettings(settings);
  lastRecordedAmount = sanitized;
  if (customAmountInput) {
    delete customAmountInput.dataset.userEdited;
    customAmountInput.value = sanitized;
    customAmountInput.placeholder = formatMl(sanitized);
  }
  updateDailyNeeds();
  scheduleReminders();
}

async function handleNotificationRequest() {
  try {
    const granted = await requestNotificationPermission();
    if (granted) {
      scheduleReminders();
      showHydrationNotification({ body: 'Você receberá lembretes periódicos de hidratação.' });
    } else {
      reminderStatus.textContent = 'Permissão de notificações não concedida.';
    }
  } catch (error) {
    reminderStatus.textContent = error.message;
  }
}

function handleDrinkNow() {
  registerIntake(Number(settings.drinkAmount) || 200, 'default-button');
}

function handleQuickAddClick(event) {
  if (!quickAddList) return;
  const button = event.target.closest('button[data-amount]');
  if (!button) {
    return;
  }

  const amount = Number(button.dataset.amount);
  if (!amount) {
    return;
  }

  registerIntake(amount, 'quick-add');
}

function handleCustomLogSubmit(event) {
  event.preventDefault();
  if (!customAmountInput) {
    return;
  }

  const value = Number(customAmountInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    customAmountInput.focus();
    return;
  }

  customAmountInput.dataset.userEdited = 'true';
  registerIntake(value, 'custom-form');
  customAmountInput.focus();
  customAmountInput.select();
}

function handleResetProgress() {
  resetDay();
  lastRecordedAmount = Number(settings.drinkAmount) || 200;
  updateDailyNeeds();
  updateReminderStatus(lastCountdownState);
  updateHistoryUI();
}

function registerIntake(amount, source = 'default-button') {
  const minVolume = Number(customAmountInput?.min) || 50;
  const maxVolume = Number(customAmountInput?.max) || 2000;
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return;
  }

  const normalized = clamp(Math.round(numericAmount / 10) * 10, minVolume, maxVolume);
  const today = addConsumption(normalized);
  lastRecordedAmount = normalized;
  consumedTodayEl.textContent = formatMl(today.total);
  updateDailyNeeds();
  updateHistoryUI();
  updateCountdownUI(lastCountdownState);

  if (source === 'custom-form' && customAmountInput) {
    customAmountInput.value = normalized;
  }
}

function renderQuickAddButtons(drinkAmount, highlightAmount) {
  if (!quickAddList) {
    return;
  }

  const minVolume = Number(customAmountInput?.min) || 50;
  const maxVolume = Number(customAmountInput?.max) || 2000;
  const amounts = Array.from(new Set([
    ...QUICK_ADD_PRESETS,
    drinkAmount,
    highlightAmount
  ].filter(Boolean)))
    .map(value => Math.round(Number(value)))
    .filter(value => Number.isFinite(value) && value >= minVolume && value <= maxVolume)
    .sort((a, b) => a - b);

  quickAddList.innerHTML = '';

  if (!amounts.length) {
    const fallback = document.createElement('p');
    fallback.className = 'hint';
    fallback.textContent = 'Ajuste a faixa de volume para exibir sugestões rápidas.';
    quickAddList.appendChild(fallback);
    return;
  }

  amounts.forEach(amount => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-pill';
    if (amount === Math.round(Number(drinkAmount))) {
      button.classList.add('quick-pill--primary');
    }
    if (highlightAmount && amount === Math.round(Number(highlightAmount))) {
      button.classList.add('quick-pill--recent');
    }
    button.dataset.amount = amount;
    button.textContent = `+${formatMl(amount)}`;
    button.setAttribute('aria-label', `Registrar ${formatMl(amount)}`);
    quickAddList.appendChild(button);
  });
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
  const startLabel = settings.startTime || '06:00';
  const endLabel = settings.endTime || '21:00';

  if (!isNotificationSupported()) {
    cancelReminderSchedule();
    updateCountdownUI({ timestamp: null, reason: 'unsupported', startTimeLabel: startLabel, endTimeLabel: endLabel });
    reminderStatus.textContent = 'Este navegador não suporta notificações.';
    return;
  }

  if (!isPermissionGranted()) {
    cancelReminderSchedule();
    updateCountdownUI({ timestamp: null, reason: 'missing-permission', startTimeLabel: startLabel, endTimeLabel: endLabel });
    reminderStatus.textContent = 'Permita notificações para ativar lembretes.';
    return;
  }

  const interval = Number(settings.reminderInterval);
  if (!interval || interval < 1) {
    cancelReminderSchedule();
    updateCountdownUI({ timestamp: null, reason: 'missing-interval', startTimeLabel: startLabel, endTimeLabel: endLabel });
    reminderStatus.textContent = 'Defina um intervalo válido para iniciar os lembretes.';
    return;
  }

  reminderStatus.textContent = 'Calculando próximo lembrete...';
  updateCountdownUI({ timestamp: null, reason: 'calculating', startTimeLabel: startLabel, endTimeLabel: endLabel });

  configureReminderSchedule({
    intervalMinutes: interval,
    startTime: startLabel,
    endTime: endLabel,
    getNotificationPayload: buildReminderNotificationPayload,
    onCountdown: updateCountdownUI
  });
}

function updateReminderStatus(state = lastCountdownState) {
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

  const doseLabel = formatMl(lastDailySummary.drinkAmount || Number(settings.drinkAmount) || 200);
  const remainingMlLabel = formatMl(lastDailySummary.remainingVolume);
  const dosesLabel = lastDailySummary.remainingSessions === 1 ? 'dose' : 'doses';

  if (!state || !state.timestamp) {
    switch (state?.reason) {
      case 'missing-interval':
        reminderStatus.textContent = 'Defina um intervalo válido e salve as preferências para ativar os lembretes.';
        break;
      case 'missing-permission':
        reminderStatus.textContent = `Permita notificações para ativar os lembretes e receber alertas de ${doseLabel}.`;
        break;
      case 'unsupported':
        reminderStatus.textContent = 'Seu navegador não suporta notificações.';
        break;
      case 'calculating':
        reminderStatus.textContent = 'Calculando próximo lembrete com base na sua janela configurada.';
        break;
      case 'inactive':
      default:
        reminderStatus.textContent = `Lembretes ativos entre ${state?.startTimeLabel || settings.startTime || '06:00'} e ${state?.endTimeLabel || settings.endTime || '21:00'} • Dose padrão ${doseLabel}.`;
    }
    return;
  }

  const countdownLabel = state.formattedDistance === 'agora'
    ? 'Agora'
    : `em ${state.formattedDistance}`;

  if (currentProgress >= 100) {
    reminderStatus.textContent = `Meta alcançada! Próximo lembrete às ${state.formattedTime} (${countdownLabel}). Continue com doses de manutenção de ${doseLabel}.`;
    return;
  }

  if (lastDailySummary.remainingSessions > 0) {
    reminderStatus.textContent = `Notificações a cada ${interval} minutos. Próximo lembrete às ${state.formattedTime} (${countdownLabel}). Restam ${lastDailySummary.remainingSessions.toLocaleString('pt-BR')} ${dosesLabel} (${remainingMlLabel}). Dose padrão ${doseLabel}.`;
  } else {
    reminderStatus.textContent = `Notificações a cada ${interval} minutos. Próximo lembrete às ${state.formattedTime} (${countdownLabel}). Use ${doseLabel} para manutenção.`;
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
      scheduleReminders();
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

function handleReminderStartChange(event) {
  const value = normalizeTimeValue(event.target.value, settings.startTime || '06:00');
  settings = { ...settings, startTime: value };
  saveSettings(settings);
  if (reminderStartInput) {
    reminderStartInput.value = value;
  }
  scheduleReminders();
}

function handleReminderEndChange(event) {
  const value = normalizeTimeValue(event.target.value, settings.endTime || '21:00');
  settings = { ...settings, endTime: value };
  saveSettings(settings);
  if (reminderEndInput) {
    reminderEndInput.value = value;
  }
  scheduleReminders();
}

function updateCountdownUI(state) {
  lastCountdownState = state || null;

  if (!nextReminderTimeEl || !nextReminderCountdownEl) {
    updateReminderStatus(state);
    return;
  }

  const startLabel = state?.startTimeLabel || settings.startTime || '06:00';
  const endLabel = state?.endTimeLabel || settings.endTime || '21:00';
  const doseLabel = formatMl(lastDailySummary.drinkAmount || Number(settings.drinkAmount) || 200);
  const remainingMlLabel = formatMl(lastDailySummary.remainingVolume);
  const dosesLabel = lastDailySummary.remainingSessions === 1 ? 'dose' : 'doses';

  if (!state || !state.timestamp) {
    nextReminderTimeEl.textContent = '--:--';
    let message;
    switch (state?.reason) {
      case 'missing-permission':
        message = 'Ative as notificações para receber lembretes.';
        break;
      case 'missing-interval':
        message = 'Defina um intervalo para ativar os lembretes.';
        break;
      case 'unsupported':
        message = 'Notificações indisponíveis neste dispositivo.';
        break;
      case 'calculating':
        message = 'Calculando próximo lembrete...';
        break;
      case 'inactive':
      default:
        message = `Aguardando próxima janela a partir de ${startLabel}. Dose padrão ${doseLabel}.`;
    }
    nextReminderCountdownEl.textContent = message;
    document.title = baseDocumentTitle;
    updateReminderStatus(state);
    return;
  }

  nextReminderTimeEl.textContent = state.formattedTime;
  if (state.remainingMs != null && state.remainingMs <= 0) {
    const maintenanceLabel = lastDailySummary.remainingSessions > 0
      ? `Beba ${doseLabel} agora.`
      : `Dose de manutenção sugerida: ${doseLabel}.`;
    nextReminderCountdownEl.textContent = `Chegou a hora! ${maintenanceLabel}`;
  } else {
    const remainingInfo = lastDailySummary.remainingSessions > 0
      ? ` • Restam ${lastDailySummary.remainingSessions.toLocaleString('pt-BR')} ${dosesLabel} (${remainingMlLabel})`
      : ' • Hidratação de manutenção';
    nextReminderCountdownEl.textContent = `Em ${state.formattedDistance}${remainingInfo}`;
  }

  if (document.visibilityState === 'hidden' && state.remainingMs && state.remainingMs > 0) {
    const dosesSuffix = lastDailySummary.remainingSessions > 0
      ? ` • ${lastDailySummary.remainingSessions}x`
      : '';
    document.title = `💧 ${state.formattedDistance}${dosesSuffix}`;
  } else {
    document.title = baseDocumentTitle;
  }

  updateReminderStatus(state);
}

function buildReminderNotificationPayload() {
  const remainingMl = lastDailySummary.remainingVolume;
  const drinkAmount = lastDailySummary.drinkAmount || Number(settings.drinkAmount) || 200;
  const suggestionAmount = remainingMl > 0 ? Math.min(drinkAmount, remainingMl) : drinkAmount;
  const remainingDoses = remainingMl > 0 ? Math.max(1, Math.ceil(remainingMl / drinkAmount)) : 0;

  if (remainingMl <= 0) {
    return {
      title: 'Hidratação de manutenção 💧',
      body: `Meta diária concluída! Beba ${formatMl(drinkAmount)} para manter o ritmo.`
    };
  }

  const dosesLabel = remainingDoses === 1 ? 'dose' : 'doses';
  return {
    title: 'Hora de beber água! 💧',
    body: `Beba ${formatMl(suggestionAmount)} agora. Restam ${formatMl(remainingMl)} para sua meta (${remainingDoses} ${dosesLabel}).`,
    timestamp: Date.now()
  };
}

function normalizeTimeValue(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }

  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatRelativeTime(value) {
  if (!value) {
    return '--';
  }

  const date = typeof value === 'string' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  const diff = Date.now() - date.getTime();
  if (diff <= 45000) {
    return 'agora';
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) {
    return 'agora';
  }

  if (minutes === 1) {
    return 'há 1 minuto';
  }

  if (minutes < 60) {
    return `há ${minutes} minutos`;
  }

  if (hours === 1) {
    return 'há 1 hora';
  }

  if (hours < 24) {
    return `há ${hours} horas`;
  }

  if (days === 1) {
    return 'ontem';
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
