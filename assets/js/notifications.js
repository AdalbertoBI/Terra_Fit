import { isNotificationSupported } from './utils.js';

let reminderTimer = null;

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

export function showHydrationNotification({ title = 'Hora de beber água!', body = 'Mantenha sua meta diária de hidratação.' } = {}) {
  if (!isPermissionGranted()) {
    return;
  }

  navigator.serviceWorker.getRegistration().then(registration => {
    if (registration) {
      registration.showNotification(title, {
        body,
        icon: 'assets/img/icons/icon-192.svg',
        vibrate: [150, 50, 150],
        tag: 'hidrate-plus-reminder'
      });
    } else {
      new Notification(title, { body });
    }
  });
}

export function startReminderLoop(intervalMinutes, getProgressMessage) {
  stopReminderLoop();

  if (!intervalMinutes || intervalMinutes < 1) {
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  reminderTimer = setInterval(() => {
    const dynamicBody = typeof getProgressMessage === 'function'
      ? getProgressMessage()
      : 'Mantenha sua meta diária de hidratação.';

    showHydrationNotification({
      title: 'Hora de beber água! 💧',
      body: dynamicBody
    });
  }, intervalMs);
}

export function stopReminderLoop() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}
