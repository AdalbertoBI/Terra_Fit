import { isNotificationSupported } from './utils.js';

const NOTIFICATION_TAG = 'hidrate-plus-reminder';

let reminderTimeout = null;
let countdownInterval = null;
let nextReminderTimestamp = null;
let countdownCallback = null;
let scheduleOptions = null;
let scheduleReason = 'inactive';

export function isPermissionGranted() {
  return isNotificationSupported() && Notification.permission === 'granted';
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    throw new Error('Navegador não suporta notificações.');
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    throw new Error('Permissão de notificação negada nas configurações do navegador.');
  }

  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function showHydrationNotification({
  title = 'Hora de beber água! 💧',
  body = 'Mantenha sua meta diária de hidratação.',
  tag = NOTIFICATION_TAG,
  requireInteraction = true,
  renotify = true,
  vibrate = [150, 50, 150],
  badge,
  data = {},
  timestamp = Date.now(),
  silent = false,
  actions = [],
  image,
  dir,
  lang
} = {}) {
  if (!isPermissionGranted()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const fallbackData = { url: registration?.scope || '/' };
  const notificationOptions = {
    body,
    icon: 'assets/img/icons/icon-192.svg',
    badge: badge || 'assets/img/icons/icon-192.svg',
    vibrate,
    tag,
    renotify,
    requireInteraction,
    data: { ...fallbackData, ...data, tag },
    timestamp,
    silent,
    actions
  };

  if (image) notificationOptions.image = image;
  if (dir) notificationOptions.dir = dir;
  if (lang) notificationOptions.lang = lang;

  if (registration) {
    return registration.showNotification(title, notificationOptions);
  }

  return new Notification(title, notificationOptions);
}

export function configureReminderSchedule({
  intervalMinutes,
  startTime,
  endTime,
  getNotificationPayload,
  onCountdown,
  tag = NOTIFICATION_TAG
} = {}) {
  cancelReminderSchedule();

  if (!intervalMinutes || intervalMinutes < 1) {
    scheduleReason = 'inactive';
    countdownCallback = onCountdown || null;
    emitCountdown();
    return;
  }

  const intervalMs = Math.max(intervalMinutes, 1) * 60 * 1000;
  const startMinutes = parseTimeToMinutes(startTime, 360);
  const endMinutes = parseTimeToMinutes(endTime, 21 * 60);

  scheduleOptions = {
    intervalMinutes,
    intervalMs,
    startMinutes,
    endMinutes,
    tag,
    getNotificationPayload: typeof getNotificationPayload === 'function'
      ? getNotificationPayload
      : () => ({}),
    onCountdown: typeof onCountdown === 'function' ? onCountdown : null,
    usesTrigger: supportsNotificationTriggers()
  };

  countdownCallback = scheduleOptions.onCountdown;
  nextReminderTimestamp = computeNextReminderTimestamp(Date.now(), scheduleOptions);
  scheduleReason = nextReminderTimestamp ? 'scheduled' : 'invalid-window';
  emitCountdown();

  if (!nextReminderTimestamp) {
    return;
  }

  startCountdown();
  scheduleTriggerNotification(nextReminderTimestamp, scheduleOptions);
  scheduleNextReminder();
}

export function cancelReminderSchedule() {
  if (reminderTimeout) {
    clearTimeout(reminderTimeout);
    reminderTimeout = null;
  }
  stopCountdown();
  nextReminderTimestamp = null;
  scheduleReason = 'inactive';
  emitCountdown();
  scheduleOptions = null;
}

export function getNextReminderTimestamp() {
  return nextReminderTimestamp;
}

function scheduleNextReminder() {
  if (!scheduleOptions || !nextReminderTimestamp) {
    return;
  }

  const delay = Math.max(0, nextReminderTimestamp - Date.now());
  const cappedDelay = Math.min(delay, 2 ** 31 - 1);

  reminderTimeout = setTimeout(async () => {
    reminderTimeout = null;

    const payload = scheduleOptions.getNotificationPayload({ timestamp: nextReminderTimestamp }) || {};

    if (!scheduleOptions.usesTrigger || document.visibilityState === 'visible') {
      await showHydrationNotification({
        ...payload,
        tag: scheduleOptions.tag,
        timestamp: nextReminderTimestamp,
        renotify: true,
        requireInteraction: true
      });
    }

    nextReminderTimestamp = computeNextReminderTimestamp(nextReminderTimestamp + 1000, scheduleOptions);
    scheduleReason = nextReminderTimestamp ? 'scheduled' : 'inactive';
    emitCountdown();

    if (nextReminderTimestamp) {
      scheduleTriggerNotification(nextReminderTimestamp, scheduleOptions);
      scheduleNextReminder();
    }
  }, cappedDelay);
}

function computeNextReminderTimestamp(referenceMs, options) {
  const now = new Date(referenceMs);
  const intervalMs = options.intervalMs;

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const dayCandidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const windowStart = minutesToDate(dayCandidate, options.startMinutes);
    let windowEnd = minutesToDate(dayCandidate, options.endMinutes);

    if (windowEnd.getTime() <= windowStart.getTime()) {
      windowEnd.setDate(windowEnd.getDate() + 1);
    }

    if (referenceMs <= windowStart.getTime()) {
      return windowStart.getTime();
    }

    if (referenceMs >= windowEnd.getTime()) {
      continue;
    }

    const elapsed = referenceMs - windowStart.getTime();
    const steps = Math.ceil(elapsed / intervalMs);
    const candidate = windowStart.getTime() + steps * intervalMs;

    if (candidate <= windowEnd.getTime()) {
      return candidate;
    }
  }

  return minutesToDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), options.startMinutes).getTime();
}

function minutesToDate(baseDate, minutes) {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  date.setHours(hours, mins, 0, 0);
  return date;
}

function parseTimeToMinutes(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }

  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return hours * 60 + minutes;
}

function emitCountdown() {
  if (!countdownCallback) {
    return;
  }

  if (!nextReminderTimestamp) {
    countdownCallback({
      timestamp: null,
      remainingMs: null,
      formattedTime: '--:--',
      formattedDistance: null,
      reason: scheduleReason,
      startTimeLabel: formatTimeFromMinutes(scheduleOptions?.startMinutes ?? 0),
      endTimeLabel: formatTimeFromMinutes(scheduleOptions?.endMinutes ?? 0)
    });
    return;
  }

  const remaining = nextReminderTimestamp - Date.now();
  countdownCallback({
    timestamp: nextReminderTimestamp,
    remainingMs: remaining,
    formattedTime: formatTime(nextReminderTimestamp),
    formattedDistance: formatDuration(remaining),
    reason: 'scheduled',
    startTimeLabel: formatTimeFromMinutes(scheduleOptions.startMinutes),
    endTimeLabel: formatTimeFromMinutes(scheduleOptions.endMinutes)
  });
}

function startCountdown() {
  stopCountdown();
  if (!countdownCallback) {
    return;
  }
  countdownInterval = setInterval(emitCountdown, 1000);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

async function scheduleTriggerNotification(timestamp, options) {
  if (!options?.usesTrigger) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration || !supportsNotificationTriggers()) {
      return;
    }

    const tag = options.tag || NOTIFICATION_TAG;
    const existing = await registration.getNotifications({ includeTriggered: true, tag });
    existing.forEach(notification => {
      const scheduledTimestamp = notification.trigger?.timestamp ?? notification.showTrigger?.timestamp;
      if (scheduledTimestamp && scheduledTimestamp > Date.now()) {
        notification.close();
      }
    });

    const trigger = new window.TimestampTrigger(timestamp);
    await registration.showNotification('Hora de beber água! 💧', {
      body: 'Toque para registrar sua hidratação.',
      icon: 'assets/img/icons/icon-192.svg',
      badge: 'assets/img/icons/icon-192.svg',
      tag,
      renotify: true,
      requireInteraction: true,
      showTrigger: trigger,
      data: { url: registration.scope, tag }
    });
  } catch (error) {
    console.warn('Falha ao agendar notificação com trigger', error);
  }
}

function supportsNotificationTriggers() {
  return 'showTrigger' in Notification.prototype && 'TimestampTrigger' in window;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTimeFromMinutes(minutes) {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatDuration(ms) {
  if (ms <= 0) {
    return 'agora';
  }

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  }

  if (minutes > 0) {
    return `${minutes}min ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
}
