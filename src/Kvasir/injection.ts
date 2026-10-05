import { ActiveStory, KvasirSettings } from './types';
import { INJECTION_IDS, renderStoryPrompt } from './services';

export function clearKvasirInjections(): void {
  uninjectPrompts(Object.values(INJECTION_IDS));
}

export function refreshKvasirInjections(settings: KvasirSettings, activeStory: ActiveStory | null): void {
  clearKvasirInjections();
  if (!activeStory) return;
  const prompts: InjectionPrompt[] = [
    {
      id: INJECTION_IDS.story,
      position: 'in_chat',
      depth: settings.injectionDepth,
      role: settings.injectionRole,
      content: renderStoryPrompt(activeStory),
    },
  ];
  if (activeStory.characterPackEnabled && activeStory.characterPack.trim()) {
    prompts.push({
      id: INJECTION_IDS.character,
      position: 'in_chat',
      depth: settings.injectionDepth,
      role: settings.injectionRole,
      content: `【Kvasir｜{{char}}人设补充包】\n${activeStory.characterPack.trim()}`,
    });
  }
  if (activeStory.npcPackEnabled && activeStory.npcPack.trim()) {
    prompts.push({
      id: INJECTION_IDS.npc,
      position: 'in_chat',
      depth: settings.injectionDepth,
      role: settings.injectionRole,
      content: `【Kvasir｜NPC人设补充包】\n${activeStory.npcPack.trim()}`,
    });
  }
  injectPrompts(prompts);
}
