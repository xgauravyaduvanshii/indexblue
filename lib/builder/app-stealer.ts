import { z } from 'zod';

export const appScreenshotSchema = z.object({
  url: z.string().url(),
  caption: z.string().optional(),
});

export const appUiComponentSchema = z.object({
  type: z.string(),
  description: z.string(),
});

export const appColorSchemeSchema = z.object({
  primary: z.string().optional(),
  secondary: z.string().optional(),
  accent: z.string().optional(),
  background: z.string().optional(),
  isDark: z.boolean().optional(),
});

export const appResearchDataSchema = z.object({
  name: z.string(),
  developer: z.string().optional(),
  category: z.string(),
  subcategory: z.string().optional(),
  description: z.string(),
  shortDescription: z.string().optional(),
  mainFunctionality: z.string(),
  features: z.array(z.string()).default([]),
  rating: z.number().optional(),
  ratingCount: z.number().optional(),
  iconUrl: z.string().url().optional(),
  screenshots: z.array(appScreenshotSchema).default([]),
  colorScheme: appColorSchemeSchema.optional(),
  navigationStyle: z.string().optional(),
  pricingModel: z.string().optional(),
  price: z.string().optional(),
  hasInAppPurchases: z.boolean().optional(),
  targetAudience: z.string().optional(),
  ageRating: z.string().optional(),
  uiComponents: z.array(appUiComponentSchema).default([]),
  reviewHighlights: z.array(z.string()).default([]),
  referenceUrls: z.array(z.string().url()).default([]),
});

export type AppResearchData = z.infer<typeof appResearchDataSchema>;
export type AppStealerInputType = 'name' | 'appstore' | 'playstore' | 'website';

export function getAppStealerSummary(data: AppResearchData) {
  const lines = [
    `Research complete for ${data.name}.`,
    `Category: ${data.category}${data.subcategory ? ` / ${data.subcategory}` : ''}.`,
    `Main purpose: ${data.mainFunctionality}.`,
  ];

  if (data.features.length > 0) {
    lines.push(`Key features: ${data.features.slice(0, 8).join(', ')}.`);
  }

  if (data.navigationStyle) {
    lines.push(`Navigation style: ${data.navigationStyle}.`);
  }

  if (data.colorScheme?.primary) {
    lines.push(`Primary color: ${data.colorScheme.primary}.`);
  }

  return lines.join('\n');
}

export function getAppStealerSystemPrompt(data: AppResearchData) {
  const featureList =
    data.features.length > 0
      ? data.features.map((feature) => `- ${feature}`).join('\n')
      : '- Build the core workflows that make the product useful.';
  const componentList =
    data.uiComponents.length > 0
      ? data.uiComponents.map((component) => `- ${component.type}: ${component.description}`).join('\n')
      : '- Use polished, mobile-first UI patterns.';

  return `You are rebuilding "${data.name}" as a stronger mobile product inside the current Expo project.

App summary:
- Name: ${data.name}
- Developer: ${data.developer ?? 'Unknown'}
- Category: ${data.category}${data.subcategory ? ` / ${data.subcategory}` : ''}
- Main purpose: ${data.mainFunctionality}
- Pricing: ${data.pricingModel ?? 'Unknown'}${data.price ? ` (${data.price})` : ''}
- Navigation: ${data.navigationStyle ?? 'Choose the best mobile-first pattern'}

Features to implement:
${featureList}

Visual direction:
- Primary color: ${data.colorScheme?.primary ?? 'Choose a premium accent color based on the reference'}
- Secondary color: ${data.colorScheme?.secondary ?? 'Derive a soft supporting color'}
- Background: ${data.colorScheme?.background ?? 'Use a clean mobile background'}
- Theme: ${data.colorScheme?.isDark ? 'Dark' : 'Light or adaptive'}

UI components observed:
${componentList}

Instructions:
- Build real screens and working product flows, not placeholders.
- Keep the app mobile-first and production-ready.
- Recreate the strongest UX ideas while improving clarity and polish.
- If assets are missing, generate or scaffold them.
- Keep code organized for Expo / React Native development.`;
}

export function getFirecrawlPrompt(input: string, inputType: AppStealerInputType) {
  const baseInstructions = `Extract:
- app name
- developer
- category and subcategory
- full description
- one-sentence main purpose
- key features
- rating and rating count
- icon URL
- screenshot URLs
- color scheme clues
- navigation style
- pricing model
- target audience
- age rating
- notable UI components
- notable user review highlights`;

  switch (inputType) {
    case 'appstore':
      return `Read this iOS App Store listing and product surface: ${input}\n\n${baseInstructions}`;
    case 'playstore':
      return `Read this Google Play listing and product surface: ${input}\n\n${baseInstructions}`;
    case 'website':
      return `Read this website for a product or app: ${input}\n\n${baseInstructions}`;
    case 'name':
    default:
      return `Research the app named "${input}" across its public product surfaces.\n\n${baseInstructions}`;
  }
}
