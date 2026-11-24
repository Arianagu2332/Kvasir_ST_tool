<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { effectiveLibrary, localExtraGroup, officialExtraGroup, officialLibrary, parseLocalLibrary, refreshRemoteLibrary } from './library';
import { clearKvasirInjections, currentChatKey, refreshKvasirInjections } from './injection';
import { loadActiveStory, loadSettings, saveActiveStory, saveSettings } from './storage';
import { generateCharacterPack, renderExtraRequest, scanNpcWorldbookEntries, setChatInput } from './services';
import { AUEntry, ExtraEntry, ExtraNsfw, ExtraWritingOptions, IFEntry, KvasirLibrary, KvasirSettings, ActiveStory, StoryKind } from './types';

const props = defineProps<{ onClose: () => void }>();
type Tab = 'au' | 'if' | 'extra' | 'character' | 'injection' | 'settings';
type EditorKind = 'au' | 'if' | 'extra' | 'group';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'au', label: 'AU库', icon: 'M12 2.5 14.7 9.3 21.5 12 14.7 14.7 12 21.5 9.3 14.7 2.5 12 9.3 9.3Z' },
  { id: 'if', label: 'IF线库', icon: 'M5 19V8m0 6 9-8m-4 0h4v4M5 14l9 5m-4 0h4v-4' },
  { id: 'extra', label: '番外小剧场', icon: 'M4 9h16v10H4zM4 9 3 5l15-3 1 4-15 3m3-5 2 3m4-5 2 4m-5 5 4 2-4 2z' },
  { id: 'character', label: '人设补充包', icon: 'M12 20S4 15.5 4 10a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 5.5-8 10-8 10Z' },
  { id: 'injection', label: '注入管理', icon: 'm12 4 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4m-16 4 8 4 8-4' },
  { id: 'settings', label: '设置', icon: 'M4 7h9m4 0h3M4 17h3m4 0h9m-7-12v4m-6 6v4' },
];

const tab = ref<Tab>('au');
const settings = reactive(loadSettings());
settings.customLibrary = parseLocalLibrary(settings.customLibrary);
const library = ref<KvasirLibrary>(effectiveLibrary(settings));
const officialExtras = ref(officialLibrary(settings).extra);
let chatKey = currentChatKey();
let storyRevision = 0;
const activeStory = ref<ActiveStory | null>(chatKey ? loadActiveStory() : null);
const selectedId = reactive<Record<StoryKind, string>>({ au: '', if: '' });
const selectedExtraId = ref('');
const extraGroupId = ref(officialExtraGroup);
const extraList = ref<HTMLElement | null>(null);
const presetNames = ref<string[]>([]);
const proxyPresetNames = ref<string[]>([]);
const notice = ref('');
const generatedCharPack = ref(activeStory.value?.characterPack ?? '');
const generatedNpcPack = ref(activeStory.value?.npcPack ?? '');
const generating = ref(false);
const npcEntries = ref<Awaited<ReturnType<typeof scanNpcWorldbookEntries>>>([]);
const selectedNpcKeys = ref<string[]>([]);
const scanningNpc = ref(false);
const editorDialog = ref<HTMLDialogElement | null>(null);
const editorInitialFocus = ref<HTMLInputElement | null>(null);
const keepEditingButton = ref<HTMLButtonElement | null>(null);
const confirmDiscard = ref(false);
const editorError = ref('');
const editorKind = ref<EditorKind>('au');
const editorDraft = ref<Record<string, any>>({});
let editorInitial = '';
let editorOpener: HTMLElement | null = null;
const extraDialog = ref<HTMLDialogElement | null>(null);
const extraWordsInput = ref<HTMLInputElement | null>(null);
const extraNsfw = ref<ExtraNsfw>('禁止');
let manualExtraOptions: ExtraWritingOptions = { minWords: 8000, styles: '幽默搞笑', extra: '' };
const extraOptions = reactive({ ...manualExtraOptions });
const extraPresetId = ref('');
const namingExtraPreset = ref(false);
const extraPresetName = ref('');
const extraFeedback = ref('');

const currentAu = computed(() => library.value.au.find(entry => entry.id === selectedId.au) ?? library.value.au[0]);
const currentIf = computed(() => library.value.if.find(entry => entry.id === selectedId.if) ?? library.value.if[0]);
const localGroups = computed(() => [{ id: localExtraGroup, title: '本地小剧场' }, ...(settings.customLibrary.extraGroups ?? [])]);
const extraGroups = computed(() => [{ id: officialExtraGroup, title: '官方小剧场' }, ...localGroups.value]);
const visibleExtras = computed(() => extraGroupId.value === officialExtraGroup
  ? officialExtras.value
  : settings.customLibrary.extra.filter(entry => entry.groupId === extraGroupId.value));
const currentExtra = computed(() => visibleExtras.value.find(entry => entry.id === selectedExtraId.value) ?? visibleExtras.value[0]);
const currentEntry = computed(() => tab.value === 'au' ? currentAu.value : currentIf.value);
const localIds = computed(() => new Set([
  ...settings.customLibrary.au.map(entry => entry.id),
  ...settings.customLibrary.if.map(entry => entry.id),
  ...settings.customLibrary.extra.map(entry => entry.id),
]));

function toast(message: string): void {
  notice.value = message;
  window.setTimeout(() => {
    if (notice.value === message) notice.value = '';
  }, 3500);
}

function refreshLibraryView(): void {
  library.value = effectiveLibrary(settings);
  officialExtras.value = officialLibrary(settings).extra;
  if (!extraGroups.value.some(group => group.id === extraGroupId.value)) extraGroupId.value = localExtraGroup;
}

function entryMainText(entry: AUEntry | IFEntry | undefined): string {
  if (!entry) return '';
  return entry.type === 'au' ? entry.world : entry.premise;
}

function updateSettings(): void {
  saveSettings(JSON.parse(JSON.stringify(settings)) as KvasirSettings);
}

function activate(kind: StoryKind, entry: AUEntry | IFEntry): void {
  const current = currentChatKey();
  if (!current) {
    toast('请先打开一个聊天');
    return;
  }
  if (current !== chatKey) syncChat();
  const active: ActiveStory = {
    kind,
    entryId: entry.id,
    title: entry.title,
    worldOrPremise: kind === 'au' ? (entry as AUEntry).world : (entry as IFEntry).premise,
    adaptationHints: entry.adaptationHints,
    taboos: entry.taboos,
    style: entry.style,
    characterPack: '',
    npcPack: '',
    characterPackEnabled: false,
    npcPackEnabled: false,
  };
  activeStory.value = active;
  storyRevision++;
  resetPackPreview();
  saveActiveStory(active);
  applyInjections();
  toast(`已启用${kind === 'au' ? 'AU' : 'IF'}：${entry.title}`);
}

function deactivate(): void {
  if (!chatKey || currentChatKey() !== chatKey) return;
  activeStory.value = null;
  storyRevision++;
  resetPackPreview();
  saveActiveStory(null);
  clearKvasirInjections();
  toast('当前故事线和补充包已清除');
}

function refreshInjections(): void {
  syncChat();
  toast('当前聊天注入已刷新');
}

function updateActive(): void {
  if (!activeStory.value || !chatKey || currentChatKey() !== chatKey) return;
  saveActiveStory({ ...activeStory.value });
  applyInjections();
}

function applyInjections(): void {
  refreshKvasirInjections(settings, activeStory.value, chatKey);
}

function resetPackPreview(): void {
  generatedCharPack.value = activeStory.value?.characterPack ?? '';
  generatedNpcPack.value = activeStory.value?.npcPack ?? '';
}

async function refreshRemote(): Promise<void> {
  try {
    const result = await refreshRemoteLibrary(settings);
    updateSettings();
    refreshLibraryView();
    const counts = `${result.library.au.length} 个 AU、${result.library.if.length} 个 IF、${result.library.extra.length} 个番外`;
    toast(result.changed ? `故事库已更新至 ${result.library.version}（${counts}）` : `故事库已经是最新版本（${counts}）`);
  } catch (error) {
    toast(`故事库更新失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function characterPresetNames(): void {
  try {
    presetNames.value = getPresetNames();
  } catch {
    presetNames.value = [];
  }
  try {
    proxyPresetNames.value = typeof getProxyPresetNames === 'function' ? getProxyPresetNames() : [];
  } catch {
    proxyPresetNames.value = [];
  }
}

async function scanNpcs(): Promise<void> {
  const originChat = chatKey;
  scanningNpc.value = true;
  try {
    const entries = await scanNpcWorldbookEntries();
    if (originChat !== chatKey || originChat !== currentChatKey()) return;
    npcEntries.value = entries;
    toast(`扫描到 ${npcEntries.value.length} 个世界书条目，请手动勾选 NPC`);
  } catch (error) {
    toast(`世界书扫描失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    scanningNpc.value = false;
  }
}

function npcKey(worldbook: string, uid: number): string {
  return `${worldbook}:${uid}`;
}

function selectedNpcEntries() {
  return npcEntries.value.filter(entry => selectedNpcKeys.value.includes(npcKey(entry.worldbook, entry.uid)));
}

async function generatePack(): Promise<void> {
  if (!activeStory.value || !chatKey || currentChatKey() !== chatKey) {
    toast('请先启用一个 AU 或 IF 故事线');
    return;
  }
  const originRevision = storyRevision;
  const originChat = chatKey;
  generating.value = true;
  try {
    const result = await generateCharacterPack(settings, {
      kind: activeStory.value.kind,
      title: activeStory.value.title,
      context: activeStory.value.worldOrPremise,
      adaptationHints: activeStory.value.adaptationHints,
      selectedNpcEntries: selectedNpcEntries(),
    });
    if (originRevision !== storyRevision || originChat !== currentChatKey()) return;
    generatedCharPack.value = result.character;
    generatedNpcPack.value = result.npc;
    toast('人设补充包已生成，请检查后注入');
  } catch (error) {
    toast(`生成人设失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    generating.value = false;
  }
}

function injectGeneratedPack(): void {
  if (!activeStory.value || !chatKey || currentChatKey() !== chatKey) return;
  activeStory.value.characterPack = generatedCharPack.value.trim();
  activeStory.value.npcPack = generatedNpcPack.value.trim();
  activeStory.value.characterPackEnabled = Boolean(activeStory.value.characterPack);
  activeStory.value.npcPackEnabled = Boolean(activeStory.value.npcPack);
  updateActive();
  toast('补充包已注入当前聊天');
}

function clearGeneratedPack(): void {
  storyRevision++;
  generatedCharPack.value = '';
  generatedNpcPack.value = '';
  if (!activeStory.value) return;
  activeStory.value.characterPack = '';
  activeStory.value.npcPack = '';
  activeStory.value.characterPackEnabled = false;
  activeStory.value.npcPackEnabled = false;
  updateActive();
}

function openExtraOptions(): void {
  const dialog = extraDialog.value;
  if (!dialog || dialog.open) return;
  extraFeedback.value = '';
  dialog.showModal();
  dialog.scrollTop = 0;
}

function selectExtraPreset(event: Event): void {
  if (!extraPresetId.value) manualExtraOptions = { ...extraOptions };
  const id = (event.target as HTMLSelectElement).value;
  const preset = settings.extraWritingPresets.find(item => item.id === id);
  extraPresetId.value = preset?.id ?? '';
  const { minWords, styles, extra } = preset ?? manualExtraOptions;
  Object.assign(extraOptions, { minWords, styles, extra });
  extraFeedback.value = '';
}

function saveExtraPreset(asNew: boolean): void {
  if (!extraWordsInput.value?.reportValidity()) return;
  const options = { minWords: extraOptions.minWords, styles: extraOptions.styles.trim(), extra: extraOptions.extra.trim() };
  if (asNew) {
    const name = extraPresetName.value.trim();
    if (!name) {
      extraFeedback.value = '请输入方案名称';
      return;
    }
    if (settings.extraWritingPresets.some(item => item.name === name)) {
      extraFeedback.value = '这个名称已存在，请换一个，或选中原方案后更新';
      return;
    }
    if (!extraPresetId.value) manualExtraOptions = { ...extraOptions };
    const id = newId('extra-preset');
    settings.extraWritingPresets.push({ id, name, ...options });
    extraPresetId.value = id;
    extraPresetName.value = '';
    namingExtraPreset.value = false;
  } else {
    const preset = settings.extraWritingPresets.find(item => item.id === extraPresetId.value);
    if (!preset) return;
    Object.assign(preset, options);
  }
  updateSettings();
  extraFeedback.value = asNew ? '方案已保存' : '方案已更新';
}

function deleteExtraPreset(): void {
  const preset = settings.extraWritingPresets.find(item => item.id === extraPresetId.value);
  if (!preset || !window.confirm(`删除方案「${preset.name}」？`)) return;
  settings.extraWritingPresets = settings.extraWritingPresets.filter(item => item.id !== preset.id);
  extraPresetId.value = '';
  manualExtraOptions = { ...extraOptions };
  updateSettings();
  extraFeedback.value = '方案已删除，当前填写的内容仍保留';
}

function generateExtraRequest(): void {
  if (!currentExtra.value) return;
  try {
    setChatInput(renderExtraRequest(currentExtra.value, {
      nsfw: extraNsfw.value,
      minWords: extraOptions.minWords,
      styles: extraOptions.styles.split(/[,，]/).map(style => style.trim()).filter(Boolean),
      extra: extraOptions.extra.trim(),
    }));
    extraDialog.value?.close();
    toast('番外指令已置入输入框');
  } catch (error) {
    extraFeedback.value = error instanceof Error ? error.message : String(error);
  }
}

function newId(kind: EditorKind | 'extra-preset'): string {
  return `custom-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openEditor(kind: EditorKind, draft: Record<string, any>): void {
  const dialog = editorDialog.value;
  if (!dialog || dialog.open) return;
  editorOpener = dialog.ownerDocument.activeElement as HTMLElement | null;
  editorKind.value = kind;
  editorDraft.value = draft;
  editorInitial = JSON.stringify(draft);
  editorError.value = '';
  confirmDiscard.value = false;
  dialog.showModal();
  dialog.scrollTop = 0;
  void nextTick(() => editorInitialFocus.value?.focus());
}

function newEditor(kind: EditorKind): void {
  const id = newId(kind);
  const base = { id, type: kind, title: '', summary: '' };
  if (kind === 'group') openEditor(kind, { id, title: '' });
  else if (kind === 'extra') openEditor(kind, { ...base, content: '', groupId: extraGroupId.value === officialExtraGroup ? localExtraGroup : extraGroupId.value });
  else openEditor(kind, { ...base, ...(kind === 'au' ? { world: '' } : { premise: '' }), adaptationHints: '', taboos: '', style: '' });
}

function editEntry(kind: Exclude<EditorKind, 'group'>, entry: AUEntry | IFEntry | ExtraEntry): void {
  if (kind === 'extra' && entry.type === 'extra' && extraGroupId.value === officialExtraGroup) {
    openEditor(kind, { id: newId(kind), type: kind, title: entry.title, summary: entry.summary ?? '', content: entry.content, groupId: localExtraGroup });
    return;
  }
  openEditor(kind, { ...entry });
}

function closeEditor(): void {
  editorDialog.value?.close();
  editorOpener?.focus();
  editorOpener = null;
  confirmDiscard.value = false;
}

function requestEditorClose(): void {
  if (JSON.stringify(editorDraft.value) === editorInitial) closeEditor();
  else if (confirmDiscard.value) resumeEditing();
  else {
    confirmDiscard.value = true;
    void nextTick(() => keepEditingButton.value?.focus());
  }
}

function resumeEditing(): void {
  confirmDiscard.value = false;
  void nextTick(() => editorInitialFocus.value?.focus());
}

function saveEditor(): void {
  const entry = { ...editorDraft.value, id: String(editorDraft.value.id), title: String(editorDraft.value.title ?? '').trim() };
  const kind = editorKind.value;
  if (!entry.title) {
    editorError.value = kind === 'group' ? '分组名称不能为空' : '条目名称不能为空';
    return;
  }
  if (kind === 'extra' && !String(editorDraft.value.content ?? '').trim()) {
    editorError.value = '请填写小剧场内容';
    return;
  }
  if (kind === 'group' && extraGroups.value.some(group => group.title === entry.title)) {
    editorError.value = '已有同名分组';
    return;
  }
  const target = (kind === 'group' ? settings.customLibrary.extraGroups ??= [] : settings.customLibrary[kind]) as Array<any>;
  const index = target.findIndex(item => item.id === entry.id);
  if (index >= 0) target.splice(index, 1, entry);
  else target.push(entry);
  updateSettings();
  refreshLibraryView();
  if (kind === 'group' || kind === 'extra') {
    extraGroupId.value = kind === 'group' ? editorDraft.value.id : editorDraft.value.groupId;
    selectedExtraId.value = kind === 'extra' ? editorDraft.value.id : '';
  }
  closeEditor();
  toast(kind === 'group' ? '分组已创建' : '本地条目已保存');
}

function deleteLocalEntry(kind: EditorKind, id: string): void {
  const target = settings.customLibrary[kind === 'au' ? 'au' : kind === 'if' ? 'if' : 'extra'] as Array<any>;
  const index = target.findIndex(item => item.id === id);
  if (index < 0) {
    toast('官方条目请在远程库中修改');
    return;
  }
  target.splice(index, 1);
  updateSettings();
  refreshLibraryView();
  toast('本地条目已删除');
}

function exportCustomLibrary(): void {
  const blob = new Blob([JSON.stringify(settings.customLibrary, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'Kvasir-本地故事库.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function importCustomLibrary(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      settings.customLibrary = parseLocalLibrary(JSON.parse(String(reader.result)));
      updateSettings();
      refreshLibraryView();
      toast('本地故事库已导入');
    } catch {
      toast('导入失败：JSON 格式无效');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function syncChat(): void {
  const next = currentChatKey();
  const changed = next !== chatKey;
  chatKey = next;
  activeStory.value = next ? loadActiveStory() : null;
  if (changed) {
    storyRevision++;
    resetPackPreview();
    npcEntries.value = [];
    selectedNpcKeys.value = [];
  }
  applyInjections();
}

watch(extraGroupId, () => { if (extraList.value) extraList.value.scrollTop = 0; }, { flush: 'post' });
watch(() => settings.theme, updateSettings);
watch(() => [settings.injectionRole, settings.injectionDepth], () => {
  updateSettings();
  syncChat();
});

let stopChatSync: (() => void) | undefined;
let stopGenerationSync: (() => void) | undefined;
onMounted(() => {
  characterPresetNames();
  if (settings.autoCheckLibrary) void refreshRemote();
  stopChatSync = eventMakeLast(tavern_events.CHAT_CHANGED, syncChat).stop;
  stopGenerationSync = eventMakeLast(tavern_events.GENERATION_AFTER_COMMANDS, syncChat).stop;
  syncChat();
});
onUnmounted(() => {
  stopChatSync?.();
  stopGenerationSync?.();
});
</script>

<template>
  <div class="kvasir-shell" :class="{ 'theme-night': settings.theme === 'night' }">
    <div class="kvasir-panel">
      <header class="topbar">
        <div class="brand-group">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none"><path d="M9 16c0-4 3-8 6-8 2 0 4 2 5 3 1-1 3-3 5-3 3 0 6 4 6 8v12c0 2-2 4-4 4H13c-2 0-4-2-4-4z" fill="currentColor" /><circle cx="13" cy="24" r="2" fill="var(--blush)" /><circle cx="27" cy="24" r="2" fill="var(--blush)" /><path d="M16 20v1m8-1v1m-6 3q2 2 4 0" stroke="var(--face)" stroke-width="1.5" stroke-linecap="round" /><path d="M33 5v6m-3-3h6" stroke="var(--face)" stroke-width="1.5" stroke-linecap="round" /></svg>
          </span>
          <div><div class="brand">Kvasir</div><div class="subtitle">AU · IF · 番外故事工作台</div></div>
        </div>
        <div class="top-actions">
          <button type="button" class="theme-toggle" :aria-label="settings.theme === 'night' ? '切换到日间模式' : '切换到夜间模式'" @click="settings.theme = settings.theme === 'night' ? 'paper' : 'night'">
            <span aria-hidden="true">{{ settings.theme === 'night' ? '☾' : '☀' }}</span>{{ settings.theme === 'night' ? '夜间' : '日间' }}
          </button>
          <button type="button" class="icon-button" aria-label="关闭 Kvasir" @click="props.onClose">×</button>
        </div>
      </header>

      <div v-if="notice" class="notice" role="status">{{ notice }}</div>

      <nav class="tabs" aria-label="Kvasir 功能导航">
        <button v-for="item in tabs" :key="item.id" type="button" :class="{ active: tab === item.id }" :aria-current="tab === item.id ? 'page' : undefined" @click="tab = item.id">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="item.icon" /></svg>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <main class="content" :class="{ 'extra-content': tab === 'extra' }">
        <section v-if="tab === 'au' || tab === 'if'" class="library-view">
          <div class="section-heading">
            <div>
              <h2>{{ tab === 'au' ? 'AU世界观库' : 'IF线库' }}</h2>
              <p>{{ tab === 'au' ? '把角色带进全新的世界观。' : '在原世界观中切换另一种可能。' }}</p>
            </div>
            <button class="primary" @click="newEditor(tab)">新增本地条目</button>
          </div>
          <div class="library-grid">
            <div class="entry-list">
              <button v-for="entry in (tab === 'au' ? library.au : library.if)" :key="entry.id" class="entry-card" :class="{ selected: currentEntry?.id === entry.id }" :aria-pressed="currentEntry?.id === entry.id" @click="tab === 'au' ? selectedId.au = entry.id : selectedId.if = entry.id">
                <strong>{{ entry.title }}</strong>
                <span>{{ entry.summary || '暂无简介' }}</span>
                <small>{{ localIds.has(entry.id) ? '本地' : '官方' }}</small>
              </button>
              <div v-if="!(tab === 'au' ? library.au : library.if).length" class="empty">故事库暂无条目，可先新增本地条目。</div>
            </div>
            <div v-if="currentEntry" class="detail-card">
              <div class="detail-title">
                <div>
                  <span class="pill">{{ tab === 'au' ? 'AU' : 'IF' }}</span>
                  <h3>{{ currentEntry.title }}</h3>
                </div>
                <span class="source-label">{{ localIds.has(currentEntry.id) ? '本地条目' : '远程条目' }}</span>
              </div>
              <p class="summary">{{ currentEntry.summary }}</p>
              <div class="text-block"><label>{{ tab === 'au' ? '世界观' : 'IF前提' }}</label><pre>{{ entryMainText(currentEntry) }}</pre></div>
              <div v-if="currentEntry.adaptationHints" class="text-block"><label>适配提示</label><pre>{{ currentEntry.adaptationHints }}</pre></div>
              <div v-if="currentEntry.taboos" class="text-block"><label>禁忌</label><pre>{{ currentEntry.taboos }}</pre></div>
              <div class="button-row">
                <button class="primary" @click="activate(tab, currentEntry)">启用这条{{ tab === 'au' ? 'AU' : 'IF' }}</button>
                <button class="secondary" @click="editEntry(tab, currentEntry)">复制到本地编辑</button>
                <button v-if="localIds.has(currentEntry.id)" class="danger" @click="deleteLocalEntry(tab, currentEntry.id)">删除本地条目</button>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'extra'" class="extra-view" aria-label="番外小剧场库">
          <div class="extra-toolbar">
            <select v-model="extraGroupId" aria-label="小剧场分组">
              <option v-for="group in extraGroups" :key="group.id" :value="group.id">{{ group.title }}</option>
            </select>
            <button class="secondary" @click="newEditor('group')">新建分组</button>
            <button class="primary" @click="newEditor('extra')">新增条目</button>
          </div>
          <div class="library-grid extra-grid">
            <div ref="extraList" class="entry-list extra-list" tabindex="0" role="region" aria-label="当前分组的小剧场列表">
              <button v-for="entry in visibleExtras" :key="entry.id" class="entry-card" :class="{ selected: currentExtra?.id === entry.id }" :aria-pressed="currentExtra?.id === entry.id" @click="selectedExtraId = entry.id"><strong>{{ entry.title }}</strong><span>{{ entry.summary || entry.content }}</span></button>
              <div v-if="!visibleExtras.length" class="empty">此分组暂无小剧场。</div>
            </div>
            <div v-if="currentExtra" class="detail-card extra-detail">
              <div class="detail-title"><h3>{{ currentExtra.title }}</h3></div>
              <div class="button-row">
                <button class="primary" aria-haspopup="dialog" @click="openExtraOptions">置入选项</button>
                <button class="secondary" @click="editEntry('extra', currentExtra)">{{ extraGroupId === officialExtraGroup ? '复制到本地' : '编辑 / 移动' }}</button>
                <button v-if="extraGroupId !== officialExtraGroup" class="danger" @click="deleteLocalEntry('extra', currentExtra.id)">删除</button>
              </div>
              <div class="text-block extra-preview"><pre>{{ currentExtra.content }}</pre></div>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'character'" class="workflow-view">
          <div class="section-heading"><div><h2>人设补充包</h2><p>只生成相对于原始角色卡的变化内容。</p></div><span v-if="activeStory" class="active-label">当前：{{ activeStory.title }}</span></div>
          <div v-if="!activeStory" class="empty large">请先在 AU 库或 IF 线库启用一条故事线。</div>
          <template v-else>
            <div class="settings-grid">
              <label>生成预设<select v-model="settings.generationPreset"><option value="in_use">当前使用的预设</option><option v-for="preset in presetNames" :key="preset" :value="preset">{{ preset }}</option></select></label>
              <label>当前生成模式<select v-model="settings.generationChannel"><option value="proxy">酒馆代理预设</option><option value="custom">独立 API</option></select></label>
            </div>
            <div v-if="settings.generationChannel === 'proxy'" class="settings-grid"><label>代理预设<select v-model="settings.proxyPreset"><option value="">跟随当前连接</option><option v-for="preset in proxyPresetNames" :key="preset" :value="preset">{{ preset }}</option></select></label></div>
            <div v-else class="settings-grid three"><label>API URL<input v-model="settings.apiurl" /></label><label>Key<input v-model="settings.apiKey" type="password" /></label><label>Model<input v-model="settings.model" /></label></div>
            <div class="npc-panel"><div class="section-heading compact"><div><h3>NPC 改写（可选）</h3><p>扫描当前角色关联世界书和聊天世界书，手动勾选 NPC 条目。启用后会明显增加 Token。</p></div><button class="secondary" :disabled="scanningNpc" @click="scanNpcs">{{ scanningNpc ? '扫描中…' : '扫描世界书' }}</button></div><div v-if="npcEntries.length" class="npc-list"><label v-for="entry in npcEntries" :key="npcKey(entry.worldbook, entry.uid)" class="npc-item"><input v-model="selectedNpcKeys" type="checkbox" :value="npcKey(entry.worldbook, entry.uid)" /><span><strong>{{ entry.name || '未命名条目' }}</strong><small>{{ entry.worldbook }}</small><em>{{ entry.content.slice(0, 120) }}</em></span></label></div></div>
            <div class="button-row"><button class="primary" :disabled="generating" @click="generatePack">{{ generating ? '生成中…' : '生成补充包' }}</button><button class="secondary" @click="injectGeneratedPack">注入当前聊天</button><button class="danger" @click="clearGeneratedPack">清除补充包</button></div>
            <div class="pack-grid"><label class="field">{{ activeStory.kind === 'au' ? 'AU' : 'IF' }} 人设补充包<textarea v-model="generatedCharPack" rows="10" placeholder="生成结果会出现在这里，可手动编辑"></textarea></label><label class="field">NPC 补充包<textarea v-model="generatedNpcPack" rows="10" placeholder="未选择 NPC 时留空"></textarea></label></div>
          </template>
        </section>

        <section v-else-if="tab === 'injection'" class="workflow-view">
          <div class="section-heading"><div><h2>注入管理</h2><p>注入只在所属聊天生效；刷新或回到该聊天时恢复。</p></div><button class="primary" @click="refreshInjections">刷新注入</button></div>
          <div v-if="activeStory" class="active-box"><strong>{{ activeStory.title }}</strong><span>{{ activeStory.kind === 'au' ? 'AU世界观' : 'IF剧情前提' }}</span><p>世界观或 IF 前提：已注入</p><p>角色补充包：{{ activeStory.characterPackEnabled ? '已注入' : '未启用' }}</p><p>NPC 补充包：{{ activeStory.npcPackEnabled ? '已注入' : '未启用' }}</p><div class="button-row"><button class="secondary" @click="activeStory.characterPackEnabled = !activeStory.characterPackEnabled; updateActive()">切换角色包</button><button class="secondary" @click="activeStory.npcPackEnabled = !activeStory.npcPackEnabled; updateActive()">切换 NPC 包</button><button class="danger" @click="deactivate">清除当前故事线</button></div></div><div v-else class="empty large">当前聊天没有启用的故事线。</div>
        </section>

        <section v-else class="workflow-view">
          <div class="section-heading"><div><h2>设置</h2><p>界面、注入和远程故事库设置。</p></div><button class="secondary" @click="refreshRemote">检查库更新</button></div>
          <div class="settings-grid three"><label>配色<select v-model="settings.theme"><option value="paper">日间</option><option value="night">夜间</option></select></label><label>注入角色<select v-model="settings.injectionRole"><option value="system">system</option><option value="assistant">assistant</option><option value="user">user</option></select></label><label>注入深度<input v-model.number="settings.injectionDepth" type="number" min="0" max="20" /></label></div>
          <label class="check-row"><input v-model="settings.autoCheckLibrary" type="checkbox" />打开 Kvasir 时自动检查远程故事库</label>
          <div class="library-tools"><h3>本地故事库</h3><p>本地条目保存在酒馆助手脚本变量中，不会被远程库更新覆盖。</p><div class="button-row"><button class="secondary" @click="exportCustomLibrary">导出本地库</button><label class="file-button secondary">导入本地库<input type="file" accept="application/json" @change="importCustomLibrary" /></label></div></div>
          <div class="active-box"><strong>远程故事库版本：{{ settings.remoteLibrary?.version ?? '尚未同步' }}</strong><p>官方库地址已绑定到 Kvasir_ST_tool 仓库。远程库更新时，只需要提交 library 文件夹。</p></div>
        </section>
      </main>

      <dialog v-if="tab === 'extra' && currentExtra" ref="extraDialog" class="editor-modal extra-modal" aria-labelledby="extra-dialog-title">
        <form @submit.prevent="generateExtraRequest">
          <div class="editor-heading">
            <h2 id="extra-dialog-title">置入选项</h2>
            <button type="button" class="icon-button" aria-label="关闭置入选项" autofocus @click="extraDialog?.close()">×</button>
          </div>
          <details :key="currentExtra.id" class="text-block extra-scene">
            <summary>{{ currentExtra.title }}</summary><pre>{{ currentExtra.content }}</pre>
          </details>
          <label class="field">写作方案
            <select :value="extraPresetId" @change="selectExtraPreset">
              <option value="">手动填写</option>
              <option v-for="preset in settings.extraWritingPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
            </select>
          </label>
          <div class="option-grid">
            <label class="field">最低字数<input ref="extraWordsInput" v-model.number="extraOptions.minWords" type="number" min="100" step="1" required /></label>
            <label class="field">NSFW<select v-model="extraNsfw"><option>禁止</option><option>允许</option><option>必须</option></select></label>
          </div>
          <label class="field">写作风格<input v-model="extraOptions.styles" placeholder="幽默搞笑, 黑色幽默" /></label>
          <label class="field">本次额外要求<textarea v-model="extraOptions.extra" rows="2" placeholder="可留空"></textarea></label>
          <div class="button-row preset-actions">
            <button type="button" class="secondary" :aria-expanded="namingExtraPreset" @click="namingExtraPreset = !namingExtraPreset">另存为方案</button>
            <template v-if="extraPresetId">
              <button type="button" class="secondary" @click="saveExtraPreset(false)">更新方案</button>
              <button type="button" class="danger" @click="deleteExtraPreset">删除方案</button>
            </template>
          </div>
          <div v-if="namingExtraPreset" class="preset-name-row">
            <input v-model="extraPresetName" aria-label="方案名称" placeholder="例如：短篇喜剧" maxlength="40" @keydown.enter.prevent="saveExtraPreset(true)" />
            <button type="button" class="secondary" @click="saveExtraPreset(true)">保存</button>
          </div>
          <p v-if="extraFeedback" class="extra-feedback" role="status">{{ extraFeedback }}</p>
          <div class="extra-submit"><button class="primary" type="submit">置入输入框</button></div>
        </form>
      </dialog>

      <dialog ref="editorDialog" class="editor-modal" aria-labelledby="editor-title" @cancel.prevent="requestEditorClose">
        <form @submit.prevent="saveEditor">
          <div class="editor-heading">
            <h2 id="editor-title">{{ editorKind === 'group' ? '新建本地分组' : '编辑本地条目' }}</h2>
            <button type="button" class="icon-button" aria-label="关闭编辑器" @click="requestEditorClose">×</button>
          </div>
          <div :inert="confirmDiscard">
            <label class="field">{{ editorKind === 'group' ? '分组名称' : '名称' }}<input ref="editorInitialFocus" v-model="editorDraft.title" /></label>
            <label v-if="editorKind !== 'group'" class="field">简介<input v-model="editorDraft.summary" /></label>
            <template v-if="editorKind === 'extra'">
              <label class="field">小剧场内容<textarea v-model="editorDraft.content" rows="8"></textarea></label>
              <label class="field">保存到分组<select v-model="editorDraft.groupId"><option v-for="group in localGroups" :key="group.id" :value="group.id">{{ group.title }}</option></select></label>
            </template>
            <template v-else-if="editorKind === 'au' || editorKind === 'if'">
              <label v-if="editorKind === 'au'" class="field">世界观<textarea v-model="editorDraft.world" rows="8"></textarea></label>
              <label v-else class="field">IF前提<textarea v-model="editorDraft.premise" rows="8"></textarea></label>
              <label class="field">适配提示<textarea v-model="editorDraft.adaptationHints" rows="4"></textarea></label>
              <label class="field">禁忌<textarea v-model="editorDraft.taboos" rows="3"></textarea></label>
              <label class="field">文风<input v-model="editorDraft.style" placeholder="可留空" /></label>
            </template>
          </div>
          <p v-if="editorError && !confirmDiscard" class="editor-error" role="alert">{{ editorError }}</p>
          <div v-if="confirmDiscard" class="discard-warning">
            <p role="alert">有未保存的修改，确定要丢弃吗？</p>
            <div class="button-row"><button ref="keepEditingButton" type="button" class="primary" @click="resumeEditing">继续编辑</button><button type="button" class="danger" @click="closeEditor">丢弃修改</button></div>
          </div>
          <div v-else class="button-row"><button class="primary" type="submit">{{ editorKind === 'group' ? '创建分组' : '保存条目' }}</button><button type="button" class="secondary" @click="requestEditorClose">取消</button></div>
        </form>
      </dialog>
    </div>
  </div>
</template>

<style>
:host { display: block; }
html, body { height: 100%; margin: 0; overflow: hidden; }
* { box-sizing: border-box; }
button, input, textarea, select { font: inherit; }
.kvasir-shell {
  color-scheme: light;
  --canvas: #fff7ed; --surface: #fffdf9; --field: #fffdfa; --text: #382944; --muted: #67556e;
  --outline: #e8d8e5; --lavender: #eee5fc; --pink: #f9a8d4; --pink-hover: #f68bc4;
  --on-pink: #52213e; --selected: #fff1f8; --focus: #853c78; --mint: #daf3ee; --on-mint: #365d55;
  --danger: #a02d49; --danger-bg: #ffedf2; --mask: #32223e66; --shadow: 0 18px 54px #361b3b40;
  --top: #fff9f7; --brand-fill: #fff9f4; --face: #653e62; --blush: #f294c3;
  height: 100%; display: grid; place-items: center; padding: 20px;
  color: var(--text); background: var(--mask);
  font: 14px/1.5 ui-rounded, 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
  scrollbar-color: var(--outline) transparent;
}
.theme-night {
  color-scheme: dark;
  --canvas: #231a2d; --surface: #302438; --field: #281f32; --text: #fff0f9; --muted: #d1bdd8;
  --outline: #594461; --lavender: #3e2e50; --pink: #ee9bc9; --pink-hover: #ffb9df;
  --on-pink: #3c1733; --selected: #422a43; --focus: #f7b6df; --mint: #263f43; --on-mint: #c9eee5;
  --danger: #ffc3cb; --danger-bg: #4b2839; --mask: #100d19b3; --shadow: 0 18px 54px #100b17a6;
  --top: #2b2034; --brand-fill: #ffeaf6; --face: #512d52; --blush: #ec8dbd;
}
.kvasir-panel { width: min(100%, 1040px); height: min(100%, 820px); min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; overflow: hidden; border: 1px solid var(--outline); border-radius: 26px; background: var(--top); box-shadow: var(--shadow); }
.topbar, .brand-group, .top-actions, .section-heading, .detail-title, .button-row, .check-row { display: flex; align-items: center; }
.topbar { justify-content: space-between; gap: 10px; padding: 16px 20px 10px; }
.brand-group, .top-actions { gap: 8px; }
.brand-mark { display: grid; place-items: center; flex: none; width: 48px; aspect-ratio: 1; border-radius: 16px; background: var(--lavender); color: var(--brand-fill); }
.brand-mark svg { width: 38px; }
.brand { font-size: 25px; font-weight: 850; line-height: 1.05; letter-spacing: -.035em; }
.subtitle { margin-top: 3px; color: var(--muted); font-size: 12px; }
button { cursor: pointer; }
.theme-toggle, .icon-button, .tabs button, .primary, .secondary, .danger { min-height: 38px; border: 1px solid transparent; border-radius: 12px; line-height: 1.25; }
.theme-toggle, .icon-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 0 10px; white-space: nowrap; background: var(--surface); color: var(--text); border-color: var(--outline); }
.theme-toggle { font-size: 12px; font-weight: 700; }
.theme-toggle span { font-size: 16px; }
.icon-button { flex: none; width: 38px; padding: 0; color: var(--muted); font-size: 23px; }
.tabs { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; padding: 6px 20px 12px; }
.tabs button { display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; padding: 6px 3px; font-size: 13px; font-weight: 650; white-space: nowrap; background: var(--lavender); color: var(--text); }
.tabs svg { width: 16px; height: 16px; flex: none; }
.tabs button.active, .primary { color: var(--on-pink); background: var(--pink); font-weight: 750; }
.primary, .secondary, .danger { padding: 8px 12px; }
.secondary { color: var(--text); background: var(--lavender); }
.danger { color: var(--danger); background: var(--danger-bg); }
@media (hover: hover) {
  .primary:not(:disabled):hover, .tabs button.active:hover { background: var(--pink-hover); }
  .secondary:not(:disabled):hover, .danger:hover, .theme-toggle:hover, .icon-button:hover, .tabs button:not(.active):hover, .entry-card:hover { border-color: var(--focus); }
}
button:disabled { opacity: .55; cursor: not-allowed; }
.notice { position: absolute; z-index: 1; inset: auto 18px 12px auto; max-width: min(360px, calc(100% - 36px)); max-height: 24%; overflow: auto; pointer-events: none; padding: 8px 12px; border: 1px solid var(--outline); border-radius: 12px; color: var(--on-mint); background: var(--mint); font-size: 13px; box-shadow: 0 5px 14px #23172e26; }
.content { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 20px; border-top: 1px solid var(--outline); background: var(--canvas); }
.content.extra-content { overflow: hidden; }
.section-heading { justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.section-heading.compact { margin-bottom: 10px; }
h2, h3, p { margin: 0; overflow-wrap: anywhere; }
h2 { font-size: 22px; line-height: 1.25; letter-spacing: -.02em; }
h3 { font-size: 17px; line-height: 1.35; }
.section-heading p, .library-tools p { margin-top: 4px; color: var(--muted); font-size: 13px; }
.library-grid { display: grid; align-items: start; grid-template-columns: minmax(180px, .8fr) minmax(0, 1.4fr); gap: 12px; }
.entry-list { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.entry-card { display: grid; gap: 3px; padding: 10px 12px; min-width: 0; min-height: 44px; text-align: left; color: var(--text); background: var(--surface); border: 1px solid var(--outline); border-radius: 14px; }
.entry-card.selected { border-color: var(--focus); box-shadow: inset 3px 0 var(--pink); background: var(--selected); }
.entry-card strong { font-size: 14px; }
.entry-card strong, .entry-card span { overflow-wrap: anywhere; }
.entry-card span { color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.entry-card small, .source-label, .pill, .active-label, .active-box > span { justify-self: start; border-radius: 99px; padding: 2px 8px; color: var(--on-mint); background: var(--mint); font-size: 11px; font-weight: 700; }
.detail-card, .active-box, .npc-panel, .library-tools { min-width: 0; padding: 16px; background: var(--surface); border: 1px solid var(--outline); border-radius: 17px; }
.detail-title { justify-content: space-between; gap: 10px; align-items: flex-start; }
.detail-title > * { min-width: 0; }
.detail-title h3 { margin-top: 4px; }
.source-label { flex: none; }
.pill { display: inline-block; color: var(--on-pink); background: var(--pink); }
.summary { margin: 9px 0; color: var(--muted); }
.text-block { margin: 12px 0; }
.text-block label, .field, .settings-grid label { display: flex; flex-direction: column; min-width: 0; gap: 4px; color: var(--muted); font-size: 12px; font-weight: 600; }
.text-block pre { margin: 5px 0 0; padding: 10px 12px; max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text); background: var(--lavender); border-radius: 11px; font: inherit; font-size: 13px; }
.button-row { flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.settings-grid, .pack-grid, .option-grid, .npc-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.settings-grid { margin-bottom: 12px; }
.settings-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
input, textarea, select { width: 100%; min-width: 0; padding: 8px 10px; min-height: 38px; color: var(--text); background: var(--field); border: 1px solid var(--outline); border-radius: 10px; font-weight: 400; }
input::placeholder, textarea::placeholder { color: var(--muted); }
textarea { resize: vertical; line-height: 1.5; }
.active-box > span { display: inline-block; margin-inline-start: 6px; }
.active-box p { margin-top: 6px; color: var(--muted); font-size: 13px; }
.npc-panel, .library-tools { margin: 14px 0; }
.npc-list { max-height: 300px; overflow: auto; }
.npc-item { display: flex; align-items: flex-start; gap: 9px; padding: 9px; border: 1px solid var(--outline); border-radius: 11px; cursor: pointer; }
.npc-item span { display: grid; gap: 3px; min-width: 0; }
.npc-item small, .npc-item em { overflow: hidden; color: var(--muted); font-size: 11px; font-style: normal; white-space: nowrap; text-overflow: ellipsis; }
.pack-grid, .option-grid, .field { margin: 10px 0; }
.check-row { gap: 7px; margin: 12px 0; color: var(--text); font-size: 13px; }
.check-row input, .npc-item input { flex: none; width: 17px; min-height: 17px; accent-color: var(--focus); }
.file-button { display: inline-flex; align-items: center; cursor: pointer; }
.file-button input { position: absolute; width: 1px; height: 1px; min-height: 0; padding: 0; clip-path: inset(50%); }
.file-button:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
.empty { padding: 26px 12px; text-align: center; color: var(--muted); background: var(--surface); border: 1px dashed var(--outline); border-radius: 14px; }
.empty.large { padding: 54px 16px; }
.extra-view { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 10px; }
.extra-toolbar { display: flex; gap: 6px; min-width: 0; }
.extra-toolbar select { flex: 1; }
.extra-toolbar button { flex-shrink: 0; white-space: nowrap; }
.extra-grid { min-height: 0; grid-template-rows: minmax(0, 1fr); align-items: stretch; }
.extra-list { overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; min-height: 0; padding-inline-end: 2px; }
.extra-list > * { flex-shrink: 0; }
.extra-detail { min-height: 0; align-self: start; max-height: 100%; overflow: auto; }
.extra-detail h3 { margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.extra-preview { margin-bottom: 0; }
.editor-modal { width: min(640px, calc(100% - 24px)); max-height: calc(100% - 24px); margin: auto; overflow: auto; overscroll-behavior: contain; padding: 18px; color: var(--text); background: var(--surface); border: 1px solid var(--outline); border-radius: 20px; box-shadow: var(--shadow); }
.editor-modal::backdrop { background: var(--mask); }
.editor-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.editor-heading h2 { font-size: 18px; }
.extra-modal { width: min(460px, calc(100% - 20px)); max-height: calc(100% - 16px); padding: 14px; }
.extra-modal summary { cursor: pointer; overflow-wrap: anywhere; color: var(--muted); font-size: 13px; }
.extra-scene { margin: 4px 0 8px; }
.extra-scene pre { max-height: min(160px, 24vh); }
.extra-modal .field { margin: 7px 0; }
.extra-modal .option-grid { gap: 8px; margin: 0; }
.extra-modal .option-grid .field { margin: 0; }
.extra-modal .preset-actions button { padding-inline: 8px; font-size: 13px; }
.preset-name-row { display: flex; gap: 6px; margin-top: 8px; }
.preset-name-row button { flex-shrink: 0; }
.extra-feedback { margin-top: 8px; color: var(--muted); font-size: 13px; }
.extra-submit { margin-top: 10px; }
.extra-submit button { width: 100%; }
.editor-error, .discard-warning { color: var(--danger); }
.discard-warning { padding: 10px; border-radius: 12px; background: var(--danger-bg); }
:where(button, input, select, textarea, summary, .extra-list):focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
@media (max-width: 700px) {
  .kvasir-shell { padding: 0; }
  .kvasir-panel { width: 100%; height: 100%; padding-bottom: env(safe-area-inset-bottom, 0px); border: 0; border-radius: 0; }
  .topbar { padding: 8px 10px 4px; }
  .brand-mark { width: 40px; border-radius: 13px; }
  .brand-mark svg { width: 32px; }
  .brand { font-size: 22px; }
  .subtitle { font-size: 11px; }
  .tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; padding: 5px 10px 8px; }
  .tabs button { gap: 4px; min-height: 38px; font-size: 12px; }
  .tabs svg { width: 14px; height: 14px; }
  .content { padding: 12px; }
  .library-grid, .settings-grid, .settings-grid.three, .pack-grid, .npc-list { grid-template-columns: minmax(0, 1fr); }
  .library-view .text-block pre { max-height: none; overflow: visible; }
  .section-heading { align-items: flex-start; flex-wrap: wrap; }
  .button-row button, .file-button { flex: 1 1 auto; justify-content: center; text-align: center; }
  .content.extra-content { padding: 8px; }
  .extra-toolbar button { padding-inline: 7px; font-size: 12px; }
  .extra-view, .extra-grid { gap: 7px; }
  .extra-grid { grid-template-rows: minmax(0, 1fr) auto; }
  .extra-detail { padding: 4px; border-radius: 14px; }
  .extra-detail .detail-title, .extra-preview { display: none; }
  .extra-detail .button-row { gap: 5px; margin: 0; }
  .extra-detail .button-row button { min-height: 40px; padding: 5px 7px; font-size: 12px; }
  .notice { inset: auto 8px 66px auto; }
  .extra-modal { margin: auto auto max(8px, env(safe-area-inset-bottom, 0px)); padding: 12px; }
  input:not([type='checkbox']), select, textarea { font-size: 16px; }
  .editor-modal button:not(.icon-button) { min-height: 40px; }
}
@media (max-width: 360px), (max-width: 700px) and (max-height: 460px) {
  .subtitle { display: none; }
}
</style>
