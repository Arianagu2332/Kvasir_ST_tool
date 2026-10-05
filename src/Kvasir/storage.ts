import { emptyLibrary, KvasirLibrary, KvasirSettings, ActiveStory } from './types';

const defaultSettings = (): KvasirSettings => ({
  theme: 'paper',
  injectionRole: 'system',
  injectionDepth: 0,
  autoCheckLibrary: true,
  lastRemoteVersion: '',
  generationPreset: 'in_use',
  generationChannel: 'proxy',
  proxyPreset: '',
  apiurl: '',
  apiKey: '',
  model: '',
  customLibrary: emptyLibrary(),
  remoteLibrary: null,
});

function scriptOption() {
  return { type: 'script' as const, script_id: getScriptId() };
}

export function loadSettings(): KvasirSettings {
  const raw = getVariables(scriptOption());
  const defaults = defaultSettings();
  return {
    ...defaults,
    ...raw,
    customLibrary: raw.customLibrary ?? defaults.customLibrary,
    remoteLibrary: raw.remoteLibrary ?? null,
  } as KvasirSettings;
}

export function saveSettings(settings: KvasirSettings): void {
  replaceVariables(settings as unknown as Record<string, any>, scriptOption());
}

export function loadActiveStory(): ActiveStory | null {
  const raw = getVariables({ type: 'chat' });
  return raw.kvasirActiveStory ?? null;
}

export function saveActiveStory(activeStory: ActiveStory | null): void {
  const raw = getVariables({ type: 'chat' });
  replaceVariables({ ...raw, kvasirActiveStory: activeStory }, { type: 'chat' });
}
