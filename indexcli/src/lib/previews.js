import { normalizeApiBaseUrl } from './config.js';

const PREVIEW_COMMAND_HINT =
  /(npm\s+run\s+(dev|start|preview)|pnpm\s+run\s+(dev|start|preview)|yarn\s+(dev|start|preview)|bun\s+(dev|start|preview)|next\s+dev|next\s+start|vite|astro|storybook|webpack|parcel|serve|http-server|python\s+-m\s+http\.server|uvicorn|gunicorn)/i;

export function shouldWatchForPreviewCommand(commandText) {
  return PREVIEW_COMMAND_HINT.test(commandText);
}

export function buildCloudPreviewUrl(baseUrl, infraId, port) {
  return `${normalizeApiBaseUrl(baseUrl)}/cloud-preview/${infraId}/${port}`;
}
