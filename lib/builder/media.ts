import 'server-only';

import { put } from '@vercel/blob';
import {
  createBuilderProjectAsset,
  updateBuilderProjectAsset,
  createBuilderProjectEvent,
} from '@/lib/db/builder-app-queries';

type MediaProjectContext = {
  id: string;
};

function getOpenAIAssetBaseUrl() {
  return process.env.OPENAI_PROXY_URL || 'https://api.openai.com';
}

function getOpenAIAssetApiKey() {
  return process.env.OPENAI_PROXY_API_KEY || process.env.OPENAI_API_KEY || '';
}

function getElevenLabsBaseUrl() {
  return process.env.ELEVENLABS_PROXY_URL || 'https://api.elevenlabs.io';
}

function sanitizeBlobPath(value: string) {
  return value.replace(/[^a-zA-Z0-9._/-]/g, '-');
}

async function uploadAssetToBlob({
  pathname,
  body,
  contentType,
}: {
  pathname: string;
  body: Buffer;
  contentType: string;
}) {
  return put(pathname, body, {
    access: 'public',
    addRandomSuffix: true,
    allowOverwrite: false,
    contentType,
  });
}

export async function generateBuilderImageAsset({
  project,
  userId,
  prompt,
  size = '1024x1024',
  quality = 'auto',
  background = 'transparent',
  outputFormat = 'png',
}: {
  project: MediaProjectContext;
  userId: string;
  prompt: string;
  size?: string;
  quality?: string;
  background?: string;
  outputFormat?: 'png' | 'webp' | 'jpeg';
}) {
  const asset = await createBuilderProjectAsset({
    projectId: project.id,
    userId,
    kind: 'image',
    sourceType: 'generated',
    status: 'running',
    name: `image-${Date.now()}.${outputFormat}`,
    prompt,
    mimeType: `image/${outputFormat}`,
  });

  if (!asset) {
    throw new Error('Failed to create image asset record.');
  }

  try {
    const response = await fetch(`${getOpenAIAssetBaseUrl()}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getOpenAIAssetApiKey()}`,
      },
      body: JSON.stringify({
        model: 'chatgpt-image-latest',
        prompt,
        n: 1,
        size,
        quality,
        background,
        output_format: outputFormat,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message || `Image generation failed with status ${response.status}`);
    }

    const payload = await response.json();
    const data = payload.data?.[0];

    if (!data?.b64_json) {
      throw new Error('Image generation returned no file data.');
    }

    const buffer = Buffer.from(data.b64_json, 'base64');
    const upload = await uploadAssetToBlob({
      pathname: sanitizeBlobPath(`builder/${project.id}/images/${asset.id}.${outputFormat}`),
      body: buffer,
      contentType: `image/${outputFormat}`,
    });

    const updated = await updateBuilderProjectAsset({
      assetId: asset.id,
      projectId: project.id,
      userId,
      patch: {
        status: 'completed',
        storageUrl: upload.url,
        storageKey: upload.pathname,
        metadata: {
          size,
          quality,
          background,
          revisedPrompt: data.revised_prompt ?? null,
        },
        completedAt: new Date(),
      },
    });

    await createBuilderProjectEvent({
      projectId: project.id,
      userId,
      channel: 'media',
      type: 'image.generated',
      payload: {
        assetId: asset.id,
        url: upload.url,
      },
    }).catch(() => undefined);

    return updated;
  } catch (error) {
    await updateBuilderProjectAsset({
      assetId: asset.id,
      projectId: project.id,
      userId,
      patch: {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Image generation failed.',
        completedAt: new Date(),
      },
    }).catch(() => undefined);
    throw error;
  }
}

export async function generateBuilderAudioAsset({
  project,
  userId,
  text,
  durationSeconds = 5,
}: {
  project: MediaProjectContext;
  userId: string;
  text: string;
  durationSeconds?: number;
}) {
  const asset = await createBuilderProjectAsset({
    projectId: project.id,
    userId,
    kind: 'audio',
    sourceType: 'generated',
    status: 'running',
    name: `audio-${Date.now()}.mp3`,
    prompt: text,
    mimeType: 'audio/mpeg',
  });

  if (!asset) {
    throw new Error('Failed to create audio asset record.');
  }

  try {
    const response = await fetch(`${getElevenLabsBaseUrl()}/v1/sound-generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        text,
        duration_seconds: durationSeconds,
        prompt_influence: 0.35,
      }),
    });

    if (!response.ok) {
      const textError = await response.text().catch(() => '');
      throw new Error(textError || `Audio generation failed with status ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const upload = await uploadAssetToBlob({
      pathname: sanitizeBlobPath(`builder/${project.id}/audio/${asset.id}.mp3`),
      body: buffer,
      contentType: 'audio/mpeg',
    });

    const updated = await updateBuilderProjectAsset({
      assetId: asset.id,
      projectId: project.id,
      userId,
      patch: {
        status: 'completed',
        storageUrl: upload.url,
        storageKey: upload.pathname,
        metadata: {
          durationSeconds,
        },
        completedAt: new Date(),
      },
    });

    await createBuilderProjectEvent({
      projectId: project.id,
      userId,
      channel: 'media',
      type: 'audio.generated',
      payload: {
        assetId: asset.id,
        url: upload.url,
      },
    }).catch(() => undefined);

    return updated;
  } catch (error) {
    await updateBuilderProjectAsset({
      assetId: asset.id,
      projectId: project.id,
      userId,
      patch: {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Audio generation failed.',
        completedAt: new Date(),
      },
    }).catch(() => undefined);
    throw error;
  }
}

export async function generateBuilderVideoAsset({
  project,
  userId,
  prompt,
  size = '1280x720',
}: {
  project: MediaProjectContext;
  userId: string;
  prompt: string;
  size?: string;
}) {
  const asset = await createBuilderProjectAsset({
    projectId: project.id,
    userId,
    kind: 'video',
    sourceType: 'generated',
    status: 'running',
    name: `video-${Date.now()}.mp4`,
    prompt,
    mimeType: 'video/mp4',
  });

  if (!asset) {
    throw new Error('Failed to create video asset record.');
  }

  try {
    const createResponse = await fetch(`${getOpenAIAssetBaseUrl()}/v1/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getOpenAIAssetApiKey()}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        model: 'sora-2-2025-12-08',
        prompt,
        size,
      }),
    });

    if (!createResponse.ok) {
      const payload = await createResponse.json().catch(() => null);
      throw new Error(payload?.error?.message || `Video generation failed with status ${createResponse.status}`);
    }

    const createPayload = await createResponse.json();
    const remoteVideoId = createPayload.id;

    if (!remoteVideoId) {
      throw new Error('Video generation did not return a job id.');
    }

    let videoUrl = '';

    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const statusResponse = await fetch(`${getOpenAIAssetBaseUrl()}/v1/videos/${remoteVideoId}`, {
        headers: {
          Authorization: `Bearer ${getOpenAIAssetApiKey()}`,
          'ngrok-skip-browser-warning': 'true',
        },
      });

      if (!statusResponse.ok) continue;

      const statusPayload = await statusResponse.json();

      if (statusPayload.status === 'completed') {
        videoUrl = `${getOpenAIAssetBaseUrl()}/v1/videos/${remoteVideoId}/content`;
        break;
      }

      if (statusPayload.status === 'failed' || statusPayload.status === 'error') {
        throw new Error(statusPayload.error || 'Video generation failed.');
      }
    }

    if (!videoUrl) {
      throw new Error('Video generation timed out.');
    }

    const downloadResponse = await fetch(videoUrl, {
      headers: {
        Authorization: `Bearer ${getOpenAIAssetApiKey()}`,
        'ngrok-skip-browser-warning': 'true',
      },
    });

    if (!downloadResponse.ok) {
      throw new Error(`Video download failed with status ${downloadResponse.status}`);
    }

    const buffer = Buffer.from(await downloadResponse.arrayBuffer());
    const upload = await uploadAssetToBlob({
      pathname: sanitizeBlobPath(`builder/${project.id}/video/${asset.id}.mp4`),
      body: buffer,
      contentType: 'video/mp4',
    });

    const updated = await updateBuilderProjectAsset({
      assetId: asset.id,
      projectId: project.id,
      userId,
      patch: {
        status: 'completed',
        storageUrl: upload.url,
        storageKey: upload.pathname,
        metadata: {
          size,
          remoteVideoId,
        },
        completedAt: new Date(),
      },
    });

    await createBuilderProjectEvent({
      projectId: project.id,
      userId,
      channel: 'media',
      type: 'video.generated',
      payload: {
        assetId: asset.id,
        url: upload.url,
      },
    }).catch(() => undefined);

    return updated;
  } catch (error) {
    await updateBuilderProjectAsset({
      assetId: asset.id,
      projectId: project.id,
      userId,
      patch: {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Video generation failed.',
        completedAt: new Date(),
      },
    }).catch(() => undefined);
    throw error;
  }
}
