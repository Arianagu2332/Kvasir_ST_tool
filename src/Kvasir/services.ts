import { ActiveStory, ExtraEntry, KvasirSettings, StoryKind } from './types';

export const INJECTION_IDS = {
  story: 'kvasir-storyline',
  character: 'kvasir-character-pack',
  npc: 'kvasir-npc-pack',
};

export function renderStoryPrompt(active: ActiveStory): string {
  const label = active.kind === 'au' ? 'AU世界观' : 'IF剧情前提';
  return [
    `【Kvasir｜当前${label}】`,
    `当前故事线：${active.title}`,
    active.worldOrPremise,
    active.adaptationHints ? `适配要求：${active.adaptationHints}` : '',
    active.taboos ? `禁忌：${active.taboos}` : '',
    active.style ? `写作风格：${active.style}` : '',
    '这是一条当前聊天正在进行中的故事线。后续正文必须遵守以上前提，不得擅自回到原本路线，也不得把本设定解释为梦境、幻觉、误会或一次性插曲。',
  ].filter(Boolean).join('\n');
}

function currentCharacterText(): string {
  const card = getCharData('current');
  if (!card) return '当前没有读取到角色卡。';
  return [
    `角色名：${card.name}`,
    `角色描述：${card.description ?? ''}`,
    `性格：${card.personality ?? ''}`,
    `场景：${card.scenario ?? ''}`,
    `示例对话：${card.mes_example ?? ''}`,
  ].join('\n');
}

function customApi(settings: KvasirSettings): CustomApiConfig | undefined {
  if (settings.generationChannel === 'proxy') {
    return settings.proxyPreset ? { proxy_preset: settings.proxyPreset } : undefined;
  }
  if (!settings.apiurl && !settings.apiKey && !settings.model) return undefined;
  return {
    apiurl: settings.apiurl || undefined,
    key: settings.apiKey || undefined,
    model: settings.model || undefined,
    source: 'openai',
  };
}

export interface NpcWorldbookEntry {
  worldbook: string;
  uid: number;
  name: string;
  content: string;
}

export async function scanNpcWorldbookEntries(): Promise<NpcWorldbookEntry[]> {
  const characterBooks = getCharWorldbookNames('current');
  const names = [...new Set([characterBooks.primary, ...characterBooks.additional, getChatWorldbookName('current')].filter(Boolean) as string[])];
  const books = await Promise.all(names.map(async worldbook => ({ worldbook, entries: await getWorldbook(worldbook) })));
  return books.flatMap(book => book.entries.map(entry => ({ worldbook: book.worldbook, uid: entry.uid, name: entry.name, content: entry.content })));
}

export async function generateCharacterPack(
  settings: KvasirSettings,
  input: {
    kind: StoryKind;
    title: string;
    context: string;
    adaptationHints: string;
    selectedNpcEntries: NpcWorldbookEntry[];
  },
): Promise<string> {
  const npcText = input.selectedNpcEntries.length
    ? ['【需要同时适配的NPC世界书条目】', ...input.selectedNpcEntries.map(entry => `【${entry.name}】\n${entry.content}`)].join('\n')
    : '本次不改写NPC。';
  const systemInstruction = [
    '你正在执行 Kvasir 工作流中的“人设补充包生成”任务。',
    '本轮不是正文剧情，也不是角色扮演。Kvasir 的任务指令优先于预设中的普通写作指令。',
    '只输出相对于原始人设新增或改变的内容，不要复述原始角色卡，不要写剧情、事件、对话或长篇背景。',
    '输出必须精简、客观、可直接注入聊天上下文。不得替用户决定行动、情绪、表态或选择。',
  ].join('\n');
  const userPrompt = [
    `请为“${input.title}”生成${input.kind === 'au' ? 'AU' : 'IF'}人设补充包。`,
    '【当前故事线】',
    input.context,
    input.adaptationHints ? `【适配要求】\n${input.adaptationHints}` : '',
    '【原始角色卡】',
    currentCharacterText(),
    npcText,
    '',
    '【输出格式】',
    '先输出【{{char}}补充包】，使用最精简的条目说明，只写变化内容。',
    input.selectedNpcEntries.length ? '随后按 NPC 名称分别输出【NPC补充包：角色名】，每个 NPC 只写必要的身份、性格或关系变化。' : '',
  ].filter(Boolean).join('\n');
  const result = await generate({
    preset_name: settings.generationPreset || 'in_use',
    user_input: userPrompt,
    should_silence: true,
    max_chat_history: 0,
    custom_api: customApi(settings),
    injects: [{ position: 'in_chat', depth: 0, role: 'system', content: systemInstruction }],
  });
  return typeof result === 'string' ? result.trim() : result.content.trim();
}

export function renderExtraRequest(entry: ExtraEntry, options: { nsfw: ExtraEntry['defaultNsfw']; minWords: number; styles: string[]; extra: string }): string {
  const styleText = options.styles.length ? `写作风格${options.styles.join('、')}` : '';
  return `<Request:请暂停当前剧情,停止角色扮演,专心为我创作一个番外小剧场.本轮允许代替{{user}}发言,允许突破字数上限.小剧场内容为:${entry.content}.要求符合{{char}}和{{user}}的人设不OOC,故事有头有尾,小剧场字数不少于${options.minWords}字,${options.nsfw === '禁止' ? '不得有NSFW情节' : options.nsfw === '必须' ? '必须包含NSFW情节' : '可以包含NSFW情节'},${styleText}.${options.extra ? `额外要求:${options.extra}.` : ''}>`;
}

export function setChatInput(content: string): void {
  const parentDocument = window.parent?.document ?? document;
  const input = parentDocument.querySelector<HTMLTextAreaElement>('#send_textarea, textarea[data-testid="send_textarea"]');
  if (!input) throw new Error('没有找到酒馆输入框。');
  input.value = content;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
