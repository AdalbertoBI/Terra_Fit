const ACTIVITY_CONFIG = {
  sedentario: {
    label: 'Sedentário',
    multiplier: 1.0,
    extra: 0
  },
  ativo: {
    label: 'Ativo',
    multiplier: 1.1,
    extra: 500
  },
  atleta: {
    label: 'Atleta',
    multiplier: 1.2,
    extra: 1000
  }
};

function getAgeReduction(age) {
  if (!age || age <= 55) {
    return 0;
  }
  const yearsAbove = age - 55;
  const reductionPercent = Math.min(yearsAbove * 0.01, 0.2);
  return reductionPercent;
}

export function calculateDailyNeed(profile) {
  const weight = Number(profile.weight) || 0;
  const age = Number(profile.age) || 0;
  const activity = profile.activity || 'sedentario';

  const baseMl = weight * 35;
  const activityConfig = ACTIVITY_CONFIG[activity] || ACTIVITY_CONFIG.sedentario;
  const withMultiplier = baseMl * activityConfig.multiplier;
  const withExtra = withMultiplier + activityConfig.extra;
  const ageReductionPercent = getAgeReduction(age);
  const ageReduction = withExtra * ageReductionPercent;
  const totalMl = Math.max(0, Math.round(withExtra - ageReduction));
  const cups = Math.ceil(totalMl / 200);

  return {
    totalMl,
    cups,
    baseMl: Math.round(baseMl),
    activityLabel: activityConfig.label,
    activityExtra: activityConfig.extra,
    multiplier: activityConfig.multiplier,
    ageReduction: Math.round(ageReduction),
    ageReductionPercent: Math.round(ageReductionPercent * 100)
  };
}

export function calculateProgress(consumed, target) {
  if (!target) return 0;
  return Math.min(150, Math.round((consumed / target) * 100));
}
