/**
 * hackathonsService.js
 * Wrapper around the Hackathon Aggregator API
 * https://github.com/0xarchit/hackathon-api
 *
 * Endpoint: GET https://hackathon-api-sigma.vercel.app/api/v1/hackathons
 * Supported query params:
 *   - platform: devfolio | mlh | unstop | hackerearth | hack2skill | reskill | whereuelevate ...
 *   - mode: online | offline
 * No API key required.
 */

const BASE_URL = 'https://hackathon-api-sigma.vercel.app/api/v1/hackathons';

/**
 * Fetch hackathons from the aggregator API.
 * @param {Object} [options]
 * @param {'online'|'offline'|''} [options.mode]   - Filter by mode
 * @param {string} [options.platform]               - Filter by platform slug
 * @returns {Promise<{ count: number, data: Hackathon[] }>}
 */
export const fetchHackathons = async ({ mode = '', platform = '' } = {}) => {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  if (platform) params.set('platform', platform);

  const url = params.toString() ? `${BASE_URL}?${params}` : BASE_URL;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Hackathon API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
};

/**
 * Platform display metadata — label + accent colour for badges.
 */
export const PLATFORM_META = {
  devfolio:      { label: 'Devfolio',      color: '#4F46E5' }, // indigo
  mlh:           { label: 'MLH',           color: '#C0392B' }, // red
  unstop:        { label: 'Unstop',        color: '#D97706' }, // amber
  hackerearth:   { label: 'HackerEarth',  color: '#1E90FF' }, // blue
  hack2skill:    { label: 'Hack2Skill',   color: '#059669' }, // emerald
  reskill:       { label: 'ReSkill',       color: '#7C3AED' }, // violet
  whereuelevate: { label: 'WhereUElevate', color: '#0891B2' }, // cyan
};

/**
 * Returns badge colour for a given platform slug.
 * Falls back to a neutral olive tone that matches the vintage theme.
 */
export const getPlatformColor = (platform) => {
  return PLATFORM_META[platform?.toLowerCase()]?.color ?? '#687053';
};

/**
 * Returns a human-readable label for a given platform slug.
 */
export const getPlatformLabel = (platform) => {
  return PLATFORM_META[platform?.toLowerCase()]?.label ?? platform;
};

/**
 * Returns how many days remain until a given ISO date string.
 * Negative value means the date has passed.
 */
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

/**
 * Format an ISO date string to "Sep 3, 2025" style.
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};
