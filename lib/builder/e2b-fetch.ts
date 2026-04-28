import 'server-only';

import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
  WritableStream as NodeWritableStream,
} from 'node:stream/web';

type NativeFetchGlobals = {
  fetch: typeof globalThis.fetch;
  Headers: typeof globalThis.Headers;
  Request: typeof globalThis.Request;
  Response: typeof globalThis.Response;
  FormData: typeof globalThis.FormData;
  Blob: typeof globalThis.Blob;
  File: typeof globalThis.File;
  ReadableStream: typeof globalThis.ReadableStream;
  WritableStream: typeof globalThis.WritableStream;
  TransformStream: typeof globalThis.TransformStream;
  WebSocket?: typeof globalThis.WebSocket;
  CloseEvent?: typeof globalThis.CloseEvent;
  ErrorEvent?: typeof globalThis.ErrorEvent;
  MessageEvent?: typeof globalThis.MessageEvent;
};

let nativeFetchDepth = 0;
let previousGlobals: NativeFetchGlobals | null = null;
let undiciModulePromise: Promise<typeof import('undici')> | null = null;

async function loadUndiciModule() {
  if (!undiciModulePromise) {
    undiciModulePromise = import('undici').catch((error) => {
      undiciModulePromise = null;
      throw error;
    });
  }

  return await undiciModulePromise;
}

async function installNativeFetchGlobals() {
  if (nativeFetchDepth === 0) {
    previousGlobals = {
      fetch: globalThis.fetch,
      Headers: globalThis.Headers,
      Request: globalThis.Request,
      Response: globalThis.Response,
      FormData: globalThis.FormData,
      Blob: globalThis.Blob,
      File: globalThis.File,
      ReadableStream: globalThis.ReadableStream,
      WritableStream: globalThis.WritableStream,
      TransformStream: globalThis.TransformStream,
      WebSocket: globalThis.WebSocket,
      CloseEvent: globalThis.CloseEvent,
      ErrorEvent: globalThis.ErrorEvent,
      MessageEvent: globalThis.MessageEvent,
    };

    globalThis.Blob = NodeBlob as unknown as typeof globalThis.Blob;
    globalThis.File = NodeFile as unknown as typeof globalThis.File;
    globalThis.ReadableStream = NodeReadableStream as unknown as typeof globalThis.ReadableStream;
    globalThis.WritableStream = NodeWritableStream as unknown as typeof globalThis.WritableStream;
    globalThis.TransformStream = NodeTransformStream as unknown as typeof globalThis.TransformStream;

    const undici = await loadUndiciModule();

    globalThis.fetch = undici.fetch as unknown as typeof globalThis.fetch;
    globalThis.Headers = undici.Headers as typeof globalThis.Headers;
    globalThis.Request = undici.Request as unknown as typeof globalThis.Request;
    globalThis.Response = undici.Response as unknown as typeof globalThis.Response;
    globalThis.FormData = undici.FormData as unknown as typeof globalThis.FormData;
    globalThis.WebSocket = undici.WebSocket as unknown as typeof globalThis.WebSocket;
    globalThis.CloseEvent = undici.CloseEvent as unknown as typeof globalThis.CloseEvent;
    globalThis.ErrorEvent = undici.ErrorEvent as unknown as typeof globalThis.ErrorEvent;
    globalThis.MessageEvent = undici.MessageEvent as unknown as typeof globalThis.MessageEvent;
  }

  nativeFetchDepth += 1;
}

function restoreNativeFetchGlobals() {
  nativeFetchDepth = Math.max(0, nativeFetchDepth - 1);

  if (nativeFetchDepth === 0 && previousGlobals) {
    globalThis.fetch = previousGlobals.fetch;
    globalThis.Headers = previousGlobals.Headers;
    globalThis.Request = previousGlobals.Request;
    globalThis.Response = previousGlobals.Response;
    globalThis.FormData = previousGlobals.FormData;
    globalThis.Blob = previousGlobals.Blob;
    globalThis.File = previousGlobals.File;
    globalThis.ReadableStream = previousGlobals.ReadableStream;
    globalThis.WritableStream = previousGlobals.WritableStream;
    globalThis.TransformStream = previousGlobals.TransformStream;
    globalThis.WebSocket = previousGlobals.WebSocket as typeof globalThis.WebSocket;
    globalThis.CloseEvent = previousGlobals.CloseEvent as typeof globalThis.CloseEvent;
    globalThis.ErrorEvent = previousGlobals.ErrorEvent as typeof globalThis.ErrorEvent;
    globalThis.MessageEvent = previousGlobals.MessageEvent as typeof globalThis.MessageEvent;
    previousGlobals = null;
  }
}

export async function withNativeFetch<T>(execute: () => Promise<T>): Promise<T> {
  await installNativeFetchGlobals();

  try {
    return await execute();
  } finally {
    restoreNativeFetchGlobals();
  }
}
