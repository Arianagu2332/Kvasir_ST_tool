export type StoryKind = 'au' | 'if';

export interface AUEntry {
  id: string;
  type: 'au';
  title: string;
  summary: string;
  world: string;
  adaptationHints: string;
  taboos: string;
  style: string;
}

export interface IFEntry {
  id: string;
  type: 'if';
  title: string;
  summary: string;
  premise: string;
  adaptationHints: string;
  taboos: string;
  style: string;
}

export interface ExtraEntry {
  id: string;
  type: 'extra';
  title: string;
  summary?: string;
  content: string;
  groupId?: string;
}

export type ExtraNsfw = '禁止' | '允许' | '必须';

export interface ExtraGroup {
  id: string;
  title: string;
}

export interface KvasirLibrary {
  schemaVersion: 1;
  version: string;
  updatedAt: string;
  au: AUEntry[];
  if: IFEntry[];
  extra: ExtraEntry[];
  extraGroups?: ExtraGroup[];
}

export interface ActiveStory {
  kind: StoryKind;
  entryId: string;
  title: string;
  worldOrPremise: string;
  adaptationHints: string;
  taboos: string;
  style: string;
  characterPack: string;
  npcPack: string;
  characterPackEnabled: boolean;
  npcPackEnabled: boolean;
}

export interface KvasirSettings {
  theme: 'paper' | 'night' | 'mint' | 'berry' | 'blueberry';
  injectionRole: 'system' | 'assistant' | 'user';
  injectionDepth: number;
  autoCheckLibrary: boolean;
  lastRemoteVersion: string;
  generationPreset: string;
  generationChannel: 'proxy' | 'custom';
  proxyPreset: string;
  apiurl: string;
  apiKey: string;
  model: string;
  customLibrary: KvasirLibrary;
  remoteLibrary: KvasirLibrary | null;
}

export const emptyLibrary = (): KvasirLibrary => ({
  schemaVersion: 1,
  version: 'local',
  updatedAt: new Date().toISOString(),
  au: [],
  if: [],
  extra: [],
});
