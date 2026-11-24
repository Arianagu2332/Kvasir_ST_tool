const start = '<<<KVASIR_FINAL>>>';
const end = '<<<END_KVASIR_FINAL>>>';

export function packFormatInstruction(withNpc: boolean): string {
  return [
    '如需思考，可在思考阶段使用普通文字；不要在思考过程中写最终标记、JSON 或补充包正文。',
    '思考完成后，只在最终回答末尾输出一次下列结构。不要加 Markdown 代码围栏或解释。标记各占一行。',
    start,
    JSON.stringify({ character: '只写角色变化；如无变化，写「无需改动」。', npc: withNpc ? '只写已选 NPC 的变化，逐个注明角色名。' : '' }),
    end,
    'JSON 的两个字段均为字符串，换行用 \\n 转义。没有 NPC 改动时 npc 留空。',
  ].join('\n');
}

export function parseFinalPack(content: string, withNpc: boolean): { character: string; npc: string } {
  const visible = content.replace(/<(think|thinking|reasoning|analysis)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').trim();
  const invalid = () => new Error('未收到完整的补充包正文。请重试；原有草稿与注入未改动。');
  if (/<\/?(?:think|thinking|reasoning|analysis)\b/i.test(visible)) throw invalid();
  const lines = visible.split(/\r?\n/);
  const markerIndex = lines.findLastIndex(line => line.trim() === start);
  if (markerIndex < 0 || lines.at(-1)?.trim() !== end) throw invalid();

  let data: unknown;
  try {
    data = JSON.parse(lines.slice(markerIndex + 1, -1).join('\n'));
  } catch {
    throw invalid();
  }
  const pack = data as { character?: unknown; npc?: unknown } | null;
  if (typeof pack?.character !== 'string' || !pack.character.trim() || typeof pack.npc !== 'string') throw invalid();
  return { character: pack.character.trim(), npc: withNpc ? pack.npc.trim() : '' };
}
