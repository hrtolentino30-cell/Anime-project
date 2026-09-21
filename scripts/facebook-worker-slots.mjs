import { pathToFileURL } from 'node:url';

export function workerMatrix(date = new Date(), requestedEpisode = '', pendingCount = 0) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid date');
  if (requestedEpisode.trim()) return {slot:[1]};
  const pending=Math.max(0,Number(pendingCount)||0);
  return {slot: pending >= 2 ? [1,2] : [1]};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(workerMatrix(
    new Date(),
    process.env.ANIMOTV_EPISODE_URL || '',
    process.env.FACEBOOK_PENDING_COUNT || '0'
  )));
}
