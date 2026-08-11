import type { GenerationDirective } from '../../src/data/types';
import type { Item } from './env';

/**
 * Builds the Groq prompts from entities.json's own generation_directive.
 *
 * The directive is injected verbatim — it is the product's voice, and this file
 * deliberately does not paraphrase, summarise, or "improve" it. The only thing
 * added around it is the concrete region/era/creature context it needs to act
 * on, plus explicit restatements of the two rules that carry the most weight
 * (needs_story and sensitive), because those apply per-creature and the model
 * needs to know which specific creatures they attach to.
 */

export function buildSystemPrompt(directive: GenerationDirective): string {
  const lines = [
    directive.role,
    '',
    'Follow every one of these instructions:',
    ...directive.instructions.map((instruction, i) => `${i + 1}. ${instruction}`),
    '',
    `Story summary rule: ${directive.story_summary_rule}`,
    '',
    `Output format: ${directive.output_format}`,
  ];
  return lines.join('\n');
}

export interface DescribeContext {
  regionName: string;
  eraLabel: string;
  eraRange: string;
  items: Item[];
}

export function buildUserPrompt(ctx: DescribeContext): string {
  const { regionName, eraLabel, eraRange, items } = ctx;

  const lines = items.map((item) => {
    const flags: string[] = [];
    if (item.needsStory) flags.push('NEEDS STORY');
    if (item.sensitive) flags.push('SENSITIVE');
    const suffix = flags.length ? ` [${flags.join(', ')}]` : '';
    return `- ${item.title} (${item.kind}): ${item.seed}${suffix}`;
  });

  const sections = [
    `Region: ${regionName}`,
    `Era: ${eraLabel} (${eraRange})`,
    '',
    'Creatures to write about, and only these:',
    ...lines,
  ];

  appendPerItemRules(sections, items);
  return sections.join('\n');
}

/**
 * One creature on its own, for when a reader picks a single name out of a
 * region's roll.
 *
 * The system prompt stays the same directive verbatim; only the length moves,
 * and it is overridden explicitly here rather than by editing the directive, so
 * there is never a second place where the voice is defined.
 */
export function buildItemPrompt(item: Item, regionName: string): string {
  const sections = [
    `Write about a single creature: ${item.title} (${item.kind}).`,
    `Seed fact: ${item.seed}`,
    `A reader reached it from ${regionName}, so keep that connection in view.`,
  ];

  sections.push(
    '',
    `Length for this entry: ${ITEM_WORD_MIN} to ${ITEM_WORD_MAX} words. This overrides the ` +
      `${WORD_MIN}-${WORD_MAX} range in your instructions, which applies to whole-region ` +
      'entries; every other rule you were given still holds.',
    '',
    'Ground everything in the seed fact above. Do not introduce other named creatures.',
  );

  appendPerItemRules(sections, [item]);
  return sections.join('\n');
}

/**
 * Restate the per-item rules against the specific items they govern. The
 * directives state them in general terms; naming the items is what makes them
 * actionable in a single pass.
 */
function appendPerItemRules(sections: string[], items: Item[]): void {
  const needsStory = items.filter((i) => i.needsStory).map((i) => i.title);
  if (needsStory.length) {
    sections.push(
      '',
      `Give a 2-3 sentence retelling of the defining tale for: ${needsStory.join(', ')}. ` +
        'The reader should finish the paragraph knowing the story itself, not just the name.',
    );
  }

  const sensitive = items.filter((i) => i.sensitive).map((i) => i.title);
  if (sensitive.length) {
    sections.push(
      '',
      `These belong to living traditions of specific living peoples: ${sensitive.join(', ')}. ` +
        'Attribute each to its culture, write about it in the present tense as something ' +
        'people still hold, and give only a brief dignified overview. Do not describe ritual ' +
        'specifics, protective or ceremonial practices, or anything held secret or sacred, ' +
        'and do not present sacred detail as spectacle.',
    );
  }
}

/** A single item gets a tighter band than a whole region. */
export const ITEM_WORD_MIN = 80;
export const ITEM_WORD_MAX = 130;

/** The directive asks for 130-190 words; this is how we check it. Hyphenated
 *  and apostrophed words count as one, matching how a person would count. */
export function countWords(prose: string): number {
  const matched = prose.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matched ? matched.length : 0;
}

export const WORD_MIN = 130;
export const WORD_MAX = 190;

/** Nudge used when a first completion lands outside the directive's word band. */
export function buildLengthCorrection(prose: string): string {
  const count = countWords(prose);
  const direction =
    count < WORD_MIN
      ? `That draft is ${count} words, which is too short.`
      : `That draft is ${count} words, which is too long.`;
  return (
    `${direction} Rewrite it as flowing prose of between ${WORD_MIN} and ${WORD_MAX} words, ` +
    'keeping every rule you were given — same subjects, same story retellings, same ' +
    'respectful handling. Return only the rewritten prose.'
  );
}
