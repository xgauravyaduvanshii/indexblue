import 'server-only';

import { generateText, Output } from 'ai';
import FirecrawlApp from '@mendable/firecrawl-js';
import Exa from 'exa-js';
import { scira } from '@/ai/providers';
import {
  appResearchDataSchema,
  type AppResearchData,
  type AppStealerInputType,
  getAppStealerSummary,
  getAppStealerSystemPrompt,
  getFirecrawlPrompt,
} from '@/lib/builder/app-stealer';

const exa = new Exa(process.env.EXA_API_KEY || '');
const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY || '' });

async function discoverReferenceUrls(input: string, inputType: AppStealerInputType) {
  if (inputType !== 'name') {
    return [input];
  }

  const queries = [`${input} ios app store`, `${input} google play store`, `${input} official website`];

  const results = await Promise.allSettled(
    queries.map((query, index) =>
      exa.search(query, {
        numResults: index === 2 ? 2 : 1,
        includeDomains: index === 0 ? ['apps.apple.com'] : index === 1 ? ['play.google.com'] : undefined,
      }),
    ),
  );

  const urls = new Set<string>();

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;

    for (const item of result.value.results ?? []) {
      if (item.url) urls.add(item.url);
    }
  }

  return Array.from(urls).slice(0, 4);
}

async function scrapeReferenceUrls(urls: string[], prompt: string) {
  const pages = await Promise.all(
    urls.map(async (url) => {
      try {
        const result = await firecrawl.scrape(url, {
          formats: ['markdown'],
          onlyMainContent: true,
          proxy: 'auto',
        });

        return {
          url,
          title: result.metadata?.title || url,
          markdown: result.markdown || '',
        };
      } catch (error) {
        return {
          url,
          title: url,
          markdown: '',
          error: error instanceof Error ? error.message : 'Failed to scrape page',
        };
      }
    }),
  );

  const compiled = pages
    .map(
      (page) =>
        `URL: ${page.url}\nTitle: ${page.title}\nContent:\n${page.markdown ? page.markdown.slice(0, 12000) : page.error || 'No content'}\n`,
    )
    .join('\n---\n');

  const { output } = await generateText({
    model: scira.languageModel('scira-default'),
    output: Output.object({ schema: appResearchDataSchema }),
    temperature: 0.2,
    prompt: `${prompt}\n\nReference pages:\n${compiled}`,
  });

  return {
    data: {
      ...output,
      referenceUrls: urls,
    } satisfies AppResearchData,
    pages,
  };
}

export async function researchReferenceApp({ input, inputType }: { input: string; inputType: AppStealerInputType }) {
  const urls = await discoverReferenceUrls(input, inputType);

  if (urls.length === 0) {
    throw new Error('No reference URLs were found for this app.');
  }

  const { data, pages } = await scrapeReferenceUrls(urls, getFirecrawlPrompt(input, inputType));

  return {
    data,
    pages,
    summary: getAppStealerSummary(data),
    systemPrompt: getAppStealerSystemPrompt(data),
  };
}
