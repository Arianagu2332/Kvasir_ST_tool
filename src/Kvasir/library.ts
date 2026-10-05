import bundledLibraryText from '../../library/library.json?raw';
import { emptyLibrary, KvasirLibrary, KvasirSettings } from './types';

const defaultManifestUrl = 'https://raw.githubusercontent.com/Arianagu2332/Kvasir_ST_tool/main/library/manifest.json';
const defaultLibraryUrl = 'https://raw.githubusercontent.com/Arianagu2332/Kvasir_ST_tool/main/library/library.json';

function parseLibrary(input: unknown): KvasirLibrary {
  const source = typeof input === 'string' ? JSON.parse(input) : input;
  if (!source || typeof source !== 'object') return emptyLibrary();
  const data = source as Partial<KvasirLibrary>;
  return {
    schemaVersion: 1,
    version: String(data.version ?? 'unknown'),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
    au: Array.isArray(data.au) ? data.au.filter(entry => entry && entry.type === 'au') : [],
    if: Array.isArray(data.if) ? data.if.filter(entry => entry && entry.type === 'if') : [],
    extra: Array.isArray(data.extra) ? data.extra.filter(entry => entry && entry.type === 'extra') : [],
  } as KvasirLibrary;
}

function mergeLibraries(...libraries: Array<KvasirLibrary | null | undefined>): KvasirLibrary {
  const result = emptyLibrary();
  for (const library of libraries) {
    if (!library) continue;
    result.version = library.version;
    result.updatedAt = library.updatedAt;
    for (const entry of library.au) result.au = [...result.au.filter(item => item.id !== entry.id), entry];
    for (const entry of library.if) result.if = [...result.if.filter(item => item.id !== entry.id), entry];
    for (const entry of library.extra) result.extra = [...result.extra.filter(item => item.id !== entry.id), entry];
  }
  return result;
}

export function bundledLibrary(): KvasirLibrary {
  try {
    return parseLibrary(bundledLibraryText);
  } catch (error) {
    console.warn('[Kvasir] 内置故事库解析失败', error);
    return emptyLibrary();
  }
}

export function effectiveLibrary(settings: KvasirSettings): KvasirLibrary {
  return mergeLibraries(bundledLibrary(), settings.remoteLibrary, settings.customLibrary);
}

export async function refreshRemoteLibrary(settings: KvasirSettings): Promise<{ library: KvasirLibrary; changed: boolean }> {
  const manifestResponse = await fetch(`${defaultManifestUrl}?t=${Date.now()}`, { cache: 'no-store' });
  if (!manifestResponse.ok) throw new Error(`远程库清单请求失败：${manifestResponse.status}`);
  const manifest = (await manifestResponse.json()) as { version?: string; library?: string };
  const version = String(manifest.version ?? 'unknown');
  const libraryUrl = manifest.library?.startsWith('http')
    ? manifest.library
    : `${defaultLibraryUrl}?v=${encodeURIComponent(version)}&t=${Date.now()}`;
  const libraryResponse = await fetch(libraryUrl, { cache: 'no-store' });
  if (!libraryResponse.ok) throw new Error(`远程故事库请求失败：${libraryResponse.status}`);
  const library = parseLibrary(await libraryResponse.json());
  const changed = settings.lastRemoteVersion !== version;
  settings.remoteLibrary = library;
  settings.lastRemoteVersion = version;
  return { library, changed };
}
