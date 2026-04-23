import fs from 'node:fs';
import path from 'node:path';
import { request } from 'undici';
import { env } from '../config/env.js';
import { getSetting, SETTING_KEYS } from './settings.js';

interface UploadResult {
  downloadPage: string;
  code: string;
  fileId?: string;
  parentFolder?: string;
}

async function getToken(): Promise<string> {
  const fromSettings = await getSetting<string>(SETTING_KEYS.GOFILE_ACCOUNT_TOKEN);
  if (fromSettings) return fromSettings;
  // Fall back to .env-stored values if we add them later; for now we rely on settings.
  return '';
}

// GoFile rotates "upload servers". Pick one.
async function pickServer(): Promise<string> {
  const res = await request('https://api.gofile.io/servers');
  if (res.statusCode >= 300) {
    throw new Error(`GoFile servers lookup failed: ${res.statusCode}`);
  }
  const data = (await res.body.json()) as {
    status?: string;
    data?: { servers?: Array<{ name: string; zone?: string }> };
  };
  const server = data.data?.servers?.[0]?.name;
  if (!server) throw new Error('GoFile returned no servers');
  return server;
}

export async function uploadFile(filePath: string): Promise<UploadResult> {
  const token = await getToken();
  if (!token) throw new Error('GoFile account token not configured');

  const server = await pickServer();
  const url = `https://${server}.gofile.io/contents/uploadfile`;

  const form = new FormData();
  const buf = await fs.promises.readFile(filePath);
  const filename = path.basename(filePath);
  form.append('file', new Blob([buf]), filename);

  const res = await request(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (res.statusCode >= 300) {
    const text = await res.body.text();
    throw new Error(`GoFile upload failed: ${res.statusCode} ${text}`);
  }

  const data = (await res.body.json()) as {
    status?: string;
    data?: {
      downloadPage?: string;
      code?: string;
      fileId?: string;
      parentFolder?: string;
    };
  };

  if (data.status !== 'ok' || !data.data?.downloadPage) {
    throw new Error(`GoFile upload returned error: ${JSON.stringify(data)}`);
  }

  return {
    downloadPage: data.data.downloadPage,
    code: data.data.code ?? '',
    fileId: data.data.fileId,
    parentFolder: data.data.parentFolder,
  };
}

// Ensure the exports directory exists
export async function ensureExportsDir(): Promise<string> {
  const dir = path.resolve(env.EXPORTS_DIR);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}
