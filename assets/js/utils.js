export function formatMl(value) {
  const parsed = Number(value) || 0;
  return `${parsed.toLocaleString('pt-BR')} ml`;
}

export function formatCups(value) {
  const parsed = Number(value) || 0;
  return parsed.toLocaleString('pt-BR');
}

export function todayKey() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

export function formatDateLabel(dateString) {
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', options);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getMotivationMessage(progress) {
  const messages = [
    'Vamos começar sua jornada de hidratação!',
    'Você está indo bem, continue assim!',
    'Você está quase lá! Beba mais um copo.',
    'Meta alcançada! Excelente trabalho!'
  ];

  if (progress === 0) return messages[0];
  if (progress < 50) return messages[1];
  if (progress < 100) return messages[2];
  return messages[3];
}

export function isNotificationSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function loadJSON(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    return JSON.parse(stored);
  } catch (error) {
    console.error('Erro ao ler JSON do localStorage', error);
    return fallback;
  }
}

export function saveJSON(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Erro ao salvar JSON no localStorage', error);
  }
}
