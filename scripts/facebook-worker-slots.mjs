import { pathToFileURL } from 'node:url';

// UTC 13:00–18:00 is 21:00–02:00 Philippine time, including midnight.
export function workerMatrix(date = new Date(), requestedEpisode = '') {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid date');
  const hour = date.getUTCHours();
  return {slot: !requestedEpisode.trim() && hour >= 13 && hour < 18 ? [1, 2] : [1]};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(workerMatrix(new Date(), process.env.ANIMOTV_EPISODE_URL || '')));
}
