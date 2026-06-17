export const scoreBand = (score) => {
  if (score >= 80) return { label: 'Strong fit', tone: 'good' };
  if (score >= 60) return { label: 'Moderate fit', tone: 'warn' };
  return { label: 'Needs improvement', tone: 'danger' };
};

