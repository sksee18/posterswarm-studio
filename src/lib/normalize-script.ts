/**
 * Turning a script pasted out of some other AI into the composer's format.
 *
 * The composer splits `scriptText` on blank lines to get one block per
 * slideshow, and treats each non-empty line inside a block as one slide (see
 * the `blocks` memo in slideshows/new/composer.tsx). Nothing else writes that
 * shape, so a script written in ChatGPT/Claude/Gemini always needs hand
 * cleaning first: "slide1:", "**Hook:**", markdown bullets, and - worst - a
 * blank line between every single slide, which the composer reads as "every
 * slide is its own slideshow".
 *
 * This is a formatting pass and nothing else. It only ever deletes labels and
 * regroups lines; it can never reword a hook, which is exactly why it is not
 * an LLM call.
 *
 * ponytail: deterministic label-strip + number-reset boundaries. Covers the AI
 * output shapes seen so far. If a real paste comes out wrong, add a separate
 * "AI cleanup" button next to it, don't make this one smarter.
 */

/** A line that is nothing but a horizontal rule: ---, ***, ___, ===. */
const RULE = /^\s*([-*_=])\1{2,}\s*$/;

/** Words that introduce a slide. Anchored and whitelisted so a bare colon is
 *  never a split point: "slide1:things to consider: a list" loses only the
 *  "slide1:" and keeps the rest verbatim. */
const SLIDE_WORDS =
  "slide|frame|image|img|page|card|photo|hook|cta|point|tip|step|part";

/** Leading "Slide 3 -" / "Hook:" / "2. Point #4)" and friends. A separator is
 *  required, so "Slide into my DMs" is left alone.
 *  `(?![a-z])` rather than `\b` after the word: "slide1" has no word boundary
 *  between "e" and "1", but it is still a label. */
const LABEL = new RegExp(
  `^[\\s*_#>]*(?:[-*•]\\s*)?(?:\\d+[.)]\\s*)?\\b(?:${SLIDE_WORDS})(?![a-z])\\s*#?\\s*(\\d+)?\\s*(?:of\\s*\\d+)?\\s*[:.)\\]\\-\\u2013\\u2014]\\s*`,
  "i",
);

/** A bare list marker: "1. text" / "2) text". Whitespace after the separator is
 *  required so "3.5x your reach" keeps its number. */
const BARE_NUM = /^\s*(\d{1,2})[.)]\s+/;

/** Words that introduce a whole slideshow rather than a slide. */
const SHOW_WORDS = "slideshows?|slide\\s*show|posts?|carousels?|sets?|decks?";

/** A line that is only a slideshow header: "Slideshow 2:", "Post 3", "Deck:".
 *  Needs a number or a separator, so a slide reading "Post" survives. */
const SHOW_ONLY = new RegExp(
  `^[\\s*_#>]*\\b(?:${SHOW_WORDS})(?![a-z])\\s*#?\\s*(?:\\d+\\s*[:.)\\-\\u2013\\u2014]?|[:.)\\-\\u2013\\u2014])\\s*$`,
  "i",
);

/** A slideshow header carrying a topic name: "Slideshow 2: Money". Needs BOTH
 *  a number and a separator, so "Post this everywhere" is not a boundary. The
 *  name is dropped, not kept as a slide - it titles the set, and the hook
 *  arrives on the next line. */
const SHOW_TITLED = new RegExp(
  `^[\\s*_#>]*\\b(?:${SHOW_WORDS})(?![a-z])\\s*#?\\s*\\d+\\s*[:.)\\-\\u2013\\u2014]\\s*.+$`,
  "i",
);

/** Chat wrapper around a pasted answer. Only ever tested against the first and
 *  last line, and only when that line stands alone, so a real hook is safe. */
const PREAMBLE = /:$/;
const POSTAMBLE =
  /^(let me know|hope (this|these|that)|feel free|enjoy|good luck|want me to|should i|i can also|anything else)/i;

/** Markdown emphasis and stray wrapping punctuation. `**` and `__` are safe to
 *  strip anywhere - nobody types them in slide copy. Single `*`/`_` only when
 *  they wrap the entire line, so snake_case and "5 * 3" survive. */
function stripMarkup(line: string): string {
  let s = line
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*>\s*/, "")
    // bullet, but only with whitespace after it, so "*emphasis*" is untouched
    .replace(/^\s*[-*•]\s+/, "")
    .trim();
  const wrapped = /^([*_])(.+)\1$/.exec(s);
  if (wrapped) s = wrapped[2].trim();
  const quoted = /^["'“‘](.+)["'”’]$/.exec(s);
  if (quoted) s = quoted[1].trim();
  return s;
}

type Item = { text: string; num: number | null };

/**
 * Clean a pasted script into the composer's format: one line per slide, one
 * blank line between slideshows. Returns the text unchanged in spirit - no
 * word is ever rewritten.
 */
export function normalizeScript(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");

  const groups: string[][] = [[]];
  let prevNum: number | null = null;
  let pendingBlank = false;
  /** a "Slide 4:" sitting alone on its line numbers the line below it */
  let carriedNum: number | null = null;

  const newGroup = () => {
    if (groups[groups.length - 1].length > 0) groups.push([]);
    prevNum = null;
    pendingBlank = false;
  };

  const push = (item: Item) => {
    // A blank line only separates slideshows when the next slide does not
    // continue the numbering. That is what stops "blank line between every
    // slide" from exploding into one slideshow per slide, while leaving
    // hand-written unnumbered scripts (where every num is null) untouched.
    const continues =
      item.num !== null && prevNum !== null && item.num > prevNum;
    const resets = item.num !== null && prevNum !== null && item.num <= prevNum;

    if ((pendingBlank && !continues) || resets) newGroup();

    groups[groups.length - 1].push(item.text);
    if (item.num !== null) prevNum = item.num;
    pendingBlank = false;
  };

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      pendingBlank = true;
      continue;
    }
    if (RULE.test(rawLine)) {
      newGroup();
      continue;
    }

    let line = stripMarkup(rawLine);
    if (!line) {
      pendingBlank = true;
      continue;
    }

    if (SHOW_ONLY.test(line) || SHOW_TITLED.test(line)) {
      newGroup();
      continue;
    }

    let num: number | null = null;
    const label = LABEL.exec(line);
    if (label) {
      num = label[1] ? Number(label[1]) : null;
      line = line.slice(label[0].length).trim();
    } else {
      const bare = BARE_NUM.exec(line);
      if (bare) {
        num = Number(bare[1]);
        line = line.slice(bare[0].length).trim();
      }
    }

    // "Slide 4:" alone on a line - its number belongs to the line below.
    if (!line) {
      if (num !== null) carriedNum = num;
      continue;
    }
    if (num === null && carriedNum !== null) num = carriedNum;
    carriedNum = null;

    push({ text: line, num });
  }

  const kept = groups.filter((g) => g.join("\n").trim());

  // "Sure! Here are two slideshows:" / "Let me know if you want more!" - the
  // chat wrapper around the answer. Only a lone line at either end qualifies.
  if (kept.length > 1 && kept[0].length === 1 && PREAMBLE.test(kept[0][0])) {
    kept.shift();
  }
  const last = kept[kept.length - 1];
  if (kept.length > 1 && last.length === 1 && POSTAMBLE.test(last[0])) {
    kept.pop();
  }

  return kept.map((g) => g.join("\n")).join("\n\n");
}
