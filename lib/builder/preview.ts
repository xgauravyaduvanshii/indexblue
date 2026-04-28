function parseExplicitPort(command: string) {
  const flagMatch = command.match(/(?:--port|-p)\s+(\d{2,5})/i);
  if (flagMatch) return Number.parseInt(flagMatch[1] ?? '', 10);

  const equalsMatch = command.match(/--port=(\d{2,5})/i);
  if (equalsMatch) return Number.parseInt(equalsMatch[1] ?? '', 10);

  const listenMatch = command.match(/(?:http\.server|serve|listen)\s+(\d{2,5})/i);
  if (listenMatch) return Number.parseInt(listenMatch[1] ?? '', 10);

  return null;
}

export function inferBuilderPreviewPort(command: string) {
  const normalized = command.trim().toLowerCase();
  const explicitPort = parseExplicitPort(normalized);

  if (normalized.includes('expo start')) {
    return explicitPort ?? 8081;
  }

  if (
    normalized.includes('next dev') ||
    normalized.includes('npm run dev') ||
    normalized.includes('pnpm dev') ||
    normalized.includes('yarn dev') ||
    normalized.includes('bun dev') ||
    normalized.includes('npm start')
  ) {
    return explicitPort ?? 3000;
  }

  if (normalized.includes('vite')) {
    return explicitPort ?? 5173;
  }

  if (normalized.includes('python -m http.server')) {
    return explicitPort ?? 8000;
  }

  if (normalized.includes('npx serve') || normalized.includes('serve -s')) {
    return explicitPort ?? 3000;
  }

  if (normalized.includes('react-native start') || normalized.includes('metro')) {
    return explicitPort ?? 8081;
  }

  return explicitPort;
}
