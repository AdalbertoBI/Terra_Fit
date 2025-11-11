import { formatDateLabel } from './utils.js';

export function renderWeeklyChart(canvas, dataset = [], goal = 2000) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  if (!dataset.length) {
    ctx.fillStyle = '#5f728a';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('Sem dados suficientes para o gráfico.', 18, height / 2);
    return;
  }

  const padding = 32;
  const barWidth = (width - padding * 2) / dataset.length * 0.5;
  const maxValue = Math.max(goal, ...dataset.map(item => item.total), 1000);

  ctx.strokeStyle = 'rgba(77, 163, 255, 0.4)';
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding + ((height - padding * 2) / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    const value = Math.round(maxValue - (maxValue / gridLines) * i);
    ctx.fillStyle = '#5f728a';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`${value} ml`, 6, y + 4);
  }

  // Goal line
  const goalY = mapValue(goal, 0, maxValue, height - padding, padding);
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = '#1f7ce0';
  ctx.beginPath();
  ctx.moveTo(padding, goalY);
  ctx.lineTo(width - padding, goalY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#1f7ce0';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('Meta diária', width - padding - 70, goalY - 6);

  dataset.forEach((item, index) => {
    const barHeight = mapValue(item.total, 0, maxValue, 0, height - padding * 2);
    const x = padding + index * ((width - padding * 2) / dataset.length) + ((width - padding * 2) / dataset.length - barWidth) / 2;
    const y = height - padding - barHeight;

    const gradient = ctx.createLinearGradient(0, y, 0, height - padding);
    gradient.addColorStop(0, '#4da3ff');
    gradient.addColorStop(1, '#9dc7ff');

    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, x, y, barWidth, barHeight, 8);
    ctx.fill();

    ctx.fillStyle = '#1e2a3b';
    ctx.font = '12px Inter, sans-serif';
    ctx.save();
    ctx.translate(x + barWidth / 2, height - padding + 16);
    ctx.rotate(-Math.PI / 12);
    ctx.fillText(formatDateLabel(item.key), -30, 0);
    ctx.restore();
  });
}

function mapValue(value, inputMin, inputMax, outputMin, outputMax) {
  if (inputMax === inputMin) return outputMin;
  return outputMin + ((value - inputMin) * (outputMax - outputMin)) / (inputMax - inputMin);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
