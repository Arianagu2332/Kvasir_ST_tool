<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { effectiveLibrary, localExtraGroup, officialExtraGroup, officialLibrary, parseLocalLibrary, refreshRemoteLibrary } from './library';
import { clearKvasirInjections, currentChatKey, refreshKvasirInjections } from './injection';
import { loadActiveStory, loadSettings, saveActiveStory, saveSettings } from './storage';
import { generateCharacterPack, renderExtraRequest, scanNpcWorldbookEntries, setChatInput } from './services';
import { AUEntry, ExtraEntry, ExtraNsfw, IFEntry, KvasirLibrary, KvasirSettings, ActiveStory, StoryKind } from './types';

const props = defineProps<{ onClose: () => void }>();
type Tab = 'au' | 'if' | 'extra' | 'character' | 'injection' | 'settings';
type EditorKind = 'au' | 'if' | 'extra' | 'group';

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
const extraOptions = reactive({ nsfw: '禁止' as ExtraNsfw, minWords: 8000, styles: '幽默搞笑', extra: '' });

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

function generateExtraRequest(): void {
  if (!currentExtra.value) {
    toast('请先选择一个番外条目');
    return;
  }
  try {
    setChatInput(renderExtraRequest(currentExtra.value, {
      nsfw: extraOptions.nsfw,
      minWords: Number(extraOptions.minWords) || 8000,
      styles: extraOptions.styles.split(/[,，]/).map(style => style.trim()).filter(Boolean),
      extra: extraOptions.extra.trim(),
    }));
    toast('番外指令已置入输入框');
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

function newId(kind: EditorKind): string {
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
  <div class="kvasir-shell" :class="{ 'theme-paper': settings.theme === 'paper', 'theme-night': settings.theme === 'night', 'theme-mint': settings.theme === 'mint', 'theme-berry': settings.theme === 'berry', 'theme-blueberry': settings.theme === 'blueberry' }">
    <div class="kvasir-panel">
      <header class="topbar">
        <div>
          <div class="brand">Kvasir</div>
          <div class="subtitle">AU / IF / 番外故事工作台</div>
        </div>
        <button class="icon-button" title="关闭" @click="props.onClose">×</button>
      </header>

      <div v-if="notice" class="notice">{{ notice }}</div>

      <nav class="tabs">
        <button :class="{ active: tab === 'au' }" @click="tab = 'au'">AU库</button>
        <button :class="{ active: tab === 'if' }" @click="tab = 'if'">IF线库</button>
        <button :class="{ active: tab === 'extra' }" @click="tab = 'extra'">番外小剧场</button>
        <button :class="{ active: tab === 'character' }" @click="tab = 'character'">人设补充包</button>
        <button :class="{ active: tab === 'injection' }" @click="tab = 'injection'">注入管理</button>
        <button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">设置</button>
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
              <button v-for="entry in (tab === 'au' ? library.au : library.if)" :key="entry.id" class="entry-card" :class="{ selected: (tab === 'au' ? selectedId.au : selectedId.if) === entry.id }" @click="tab === 'au' ? selectedId.au = entry.id : selectedId.if = entry.id">
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
              <div class="extra-detail-body">
                <details :key="currentExtra.id" class="text-block"><summary>查看小剧场内容</summary><pre>{{ currentExtra.content }}</pre></details>
                <div class="option-grid">
                  <label>NSFW<select v-model="extraOptions.nsfw"><option>禁止</option><option>允许</option><option>必须</option></select></label>
                  <label>最低字数<input v-model.number="extraOptions.minWords" type="number" min="100" step="100" /></label>
                </div>
                <label class="field">写作风格<input v-model="extraOptions.styles" placeholder="幽默搞笑, 黑色幽默" /></label>
                <label class="field">本次额外要求<textarea v-model="extraOptions.extra" rows="2" placeholder="可留空"></textarea></label>
              </div>
              <div class="button-row"><button class="primary" @click="generateExtraRequest">置入输入框</button><button class="secondary" @click="editEntry('extra', currentExtra)">{{ extraGroupId === officialExtraGroup ? '复制到本地' : '编辑 / 移动' }}</button><button v-if="extraGroupId !== officialExtraGroup" class="danger" @click="deleteLocalEntry('extra', currentExtra.id)">删除</button></div>
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
          <div class="settings-grid three"><label>配色<select v-model="settings.theme"><option value="paper">黑白日间</option><option value="night">黑白夜间</option><option value="mint">薄荷果冻</option><option value="berry">莓果果冻</option><option value="blueberry">蓝莓果冻</option></select></label><label>注入角色<select v-model="settings.injectionRole"><option value="system">system</option><option value="assistant">assistant</option><option value="user">user</option></select></label><label>注入深度<input v-model.number="settings.injectionDepth" type="number" min="0" max="20" /></label></div>
          <label class="check-row"><input v-model="settings.autoCheckLibrary" type="checkbox" />打开 Kvasir 时自动检查远程故事库</label>
          <div class="library-tools"><h3>本地故事库</h3><p>本地条目保存在酒馆助手脚本变量中，不会被远程库更新覆盖。</p><div class="button-row"><button class="secondary" @click="exportCustomLibrary">导出本地库</button><label class="file-button secondary">导入本地库<input type="file" accept="application/json" @change="importCustomLibrary" /></label></div></div>
          <div class="active-box"><strong>远程故事库版本：{{ settings.remoteLibrary?.version ?? '尚未同步' }}</strong><p>官方库地址已绑定到 Kvasir_ST_tool 仓库。远程库更新时，只需要提交 library 文件夹。</p></div>
        </section>
      </main>

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
html, body { margin: 0; }
* { box-sizing: border-box; }
button, input, textarea, select { font: inherit; }
.kvasir-shell { --bg: #f5f5f2; --panel: #ffffff; --text: #202020; --muted: #727272; --line: #d7d7d2; --accent: #202020; --accent-text: #ffffff; --soft: #eeeeea; --danger: #a53535; min-height: 100vh; padding: 5vh 4vw; color: var(--text); background: rgba(20,20,20,.48); font-family: Inter, ui-sans-serif, system-ui, 'Microsoft YaHei', sans-serif; }
.theme-night { --bg: #1a1a1b; --panel: #252526; --text: #f2f2f2; --muted: #a8a8aa; --line: #48484b; --accent: #f2f2f2; --accent-text: #1a1a1b; --soft: #333336; }
.theme-mint { --bg: #e4faf1; --panel: #fbfffd; --text: #153a31; --muted: #5d8478; --line: #b9e3d3; --accent: #267e67; --accent-text: #ffffff; --soft: #d9f2e8; }
.theme-berry { --bg: #fff0f6; --panel: #fffafd; --text: #4a1930; --muted: #96627b; --line: #f0c5d8; --accent: #b34f7d; --accent-text: #ffffff; --soft: #fde0ec; }
.theme-blueberry { --bg: #eef1ff; --panel: #fbfcff; --text: #202850; --muted: #65709d; --line: #c7cff4; --accent: #5967bb; --accent-text: #ffffff; --soft: #e3e7ff; }
.kvasir-panel { display: flex; flex-direction: column; width: min(980px, 92vw); height: min(900px, 90vh); margin: auto; overflow: hidden; background: var(--panel); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 24px 80px rgba(0,0,0,.28); }
.topbar, .section-heading, .detail-title, .button-row, .tabs, .check-row { display: flex; align-items: center; }
.topbar { justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--line); }
.brand { font-size: 25px; font-weight: 800; letter-spacing: .08em; }
.subtitle, .section-heading p, .summary, .source-label, .active-label, .empty, .library-tools p { color: var(--muted); font-size: 13px; }
.icon-button { border: 0; color: var(--muted); background: transparent; cursor: pointer; font-size: 28px; line-height: 1; }
.notice { margin: 12px 24px 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--soft); font-size: 13px; }
.tabs { gap: 6px; padding: 12px 18px; overflow-x: auto; border-bottom: 1px solid var(--line); }
.tabs button, .secondary, .danger, .primary { border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; cursor: pointer; transition: .15s ease; }
.tabs button { flex: 0 0 auto; color: var(--muted); background: transparent; }
.tabs button.active, .primary { color: var(--accent-text); background: var(--accent); border-color: var(--accent); }
.secondary { color: var(--text); background: var(--soft); }
.danger { color: var(--danger); background: transparent; border-color: currentColor; }
button:disabled { opacity: .5; cursor: not-allowed; }
.content { flex: 1; min-height: 0; overflow: auto; padding: 24px; background: var(--bg); }
.content.extra-content { overflow: hidden; }
.extra-view { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 12px; }
.extra-toolbar { display: flex; gap: 8px; min-width: 0; }
.extra-toolbar select { flex: 1; min-width: 0; }
.extra-toolbar button { flex-shrink: 0; white-space: nowrap; }
.extra-grid { min-height: 0; grid-template-rows: minmax(0, 1fr); }
.extra-list { overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; min-height: 0; }
.extra-list > * { flex-shrink: 0; }
.extra-detail { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; }
.extra-detail h3 { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.extra-detail-body { min-height: 0; overflow: auto; overscroll-behavior: contain; }
.extra-detail-body details { margin: 8px 0; }
.extra-detail-body summary { cursor: pointer; color: var(--muted); font-size: 13px; }
.extra-detail-body pre { max-height: min(160px, 24vh); }
.extra-detail .button-row { margin-top: 8px; }
.section-heading { justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.section-heading.compact { margin-bottom: 12px; }
h2, h3, p { margin: 0; }
h2 { font-size: 21px; }
h3 { margin-top: 7px; font-size: 18px; }
.section-heading p { margin-top: 5px; }
.library-grid { display: grid; grid-template-columns: minmax(220px, .75fr) minmax(0, 1.4fr); gap: 16px; }
.entry-list { display: flex; flex-direction: column; gap: 8px; }
.entry-card { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 13px; text-align: left; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.entry-card.selected { border-color: var(--accent); box-shadow: inset 3px 0 var(--accent); }
.entry-card span { color: var(--muted); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.entry-card small, .source-label { font-size: 11px; }
.detail-card, .active-box, .npc-panel, .library-tools { padding: 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
.detail-title { justify-content: space-between; align-items: flex-start; gap: 12px; }
.pill { display: inline-block; padding: 4px 7px; color: var(--accent-text); background: var(--accent); border-radius: 5px; font-size: 10px; letter-spacing: .08em; }
.summary { margin: 14px 0; }
.text-block { margin: 15px 0; }
.text-block label, .field, .settings-grid label { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 12px; }
.text-block pre { margin: 6px 0 0; padding: 12px; max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: var(--text); background: var(--soft); border-radius: 8px; font: inherit; font-size: 13px; line-height: 1.55; }
.button-row { flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.settings-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
input, textarea, select { width: 100%; padding: 9px 10px; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 7px; outline: none; }
textarea { resize: vertical; line-height: 1.5; }
.active-box p { margin-top: 8px; color: var(--muted); font-size: 13px; }
.npc-panel { margin: 18px 0; }
.npc-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-height: 300px; overflow: auto; }
.npc-item { display: flex; gap: 9px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
.npc-item span { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.npc-item small, .npc-item em { overflow: hidden; color: var(--muted); font-size: 11px; font-style: normal; white-space: nowrap; text-overflow: ellipsis; }
.pack-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 15px; }
.option-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 15px 0; }
.field { margin: 12px 0; }
.check-row { gap: 8px; margin: 15px 0; color: var(--text); font-size: 13px; }
.check-row input { width: auto; }
.file-button { display: inline-flex; align-items: center; cursor: pointer; }
.file-button input { display: none; }
.empty { padding: 30px 12px; text-align: center; border: 1px dashed var(--line); border-radius: 10px; }
.empty.large { padding: 70px 20px; }
.editor-modal { width: min(680px, 94vw); max-height: 90vh; max-height: 90dvh; margin: auto; overflow: auto; overscroll-behavior: contain; padding: 22px; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; }
.editor-modal::backdrop { background: rgba(0,0,0,.55); }
.editor-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.editor-error, .discard-warning { color: var(--danger); }
.discard-warning { padding: 12px; border: 1px solid var(--line); border-radius: 8px; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, .extra-list:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 700px) {
  .kvasir-shell { padding: 0; }
  .kvasir-panel { width: 100vw; height: 100vh; height: 100dvh; border: 0; border-radius: 0; }
  .topbar { padding: 14px 16px 12px; }
  .content { padding: 16px; }
  .library-grid, .settings-grid, .settings-grid.three, .pack-grid, .npc-list, .option-grid { grid-template-columns: 1fr; }
  .section-heading { align-items: flex-start; flex-direction: column; }
  .section-heading .primary, .section-heading .secondary { align-self: stretch; }
  .button-row button, .file-button { flex: 1 1 auto; text-align: center; }
  .content.extra-content { padding: 10px; }
  .extra-view, .extra-grid { gap: 8px; }
  .extra-grid { grid-template-rows: minmax(0, 1fr) minmax(0, 2.5fr); }
  .extra-grid:has(> .extra-list:only-child) { grid-template-rows: minmax(0, 1fr); }
  .extra-detail { padding: 10px; }
  .extra-detail .option-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 6px 0; }
  .extra-detail .field { margin: 6px 0; }
}
</style>
