import assert from "node:assert";
import { normalizeScript } from "../src/lib/normalize-script";

// The composer reads blank lines as slideshow boundaries and every other line
// as a slide, so getting the regrouping wrong silently turns one 6-slide post
// into six 1-slide posts. These cases are the AI output shapes that actually
// land in the box.

const eq = (input: string, want: string, why: string) =>
  assert.strictEqual(normalizeScript(input), want, why);

// ---- the reported case: labelled slides, blank line between each ----
eq(
  "slide1:blah blah blah\n\nslide 2:blah blah ",
  "blah blah blah\nblah blah",
  "consecutive numbering means the blank lines are AI spacing, not boundaries",
);

// ---- only the leading label goes; inner colons are content ----
eq(
  "slide1: things to consider: a list",
  "things to consider: a list",
  "a bare colon is never a split point",
);

// ---- a number reset starts a new slideshow, with or without blank lines ----
eq(
  "slide 1: a\nslide 2: b\nslide 1: c\nslide 2: d",
  "a\nb\n\nc\nd",
  "slide numbering restarting at 1 is a slideshow boundary",
);

// ---- explicit separators ----
eq("slide 1: a\n---\nslide 1: b", "a\n\nb", "horizontal rule is a boundary");
eq(
  "Slideshow 1:\nslide 1: a\n\nSlideshow 2:\nslide 1: b",
  "a\n\nb",
  "a standalone slideshow header breaks and leaves no residue",
);
eq(
  "Slideshow 1: Morning habits\nslide 1: a\n\nSlideshow 2: Money\nslide 1: b",
  "a\n\nb",
  "a titled slideshow header breaks and drops its topic name - it is not a slide",
);

// ---- the chat wrapper around a pasted answer ----
eq(
  "Sure! Here are two slideshows:\n\nslide 1: a\nslide 2: b\n\nLet me know if you want more!",
  "a\nb",
  "lone preamble and postamble lines are dropped",
);
eq(
  "Three things nobody tells you:\nfirst\nsecond",
  "Three things nobody tells you:\nfirst\nsecond",
  "a colon line that is not alone in its block is a real hook",
);
eq(
  "Hope this helps",
  "Hope this helps",
  "the only block is never treated as chatter",
);

// ---- markdown ----
eq("**Hook:** text", "text", "bold label");
eq("## Slide 1 - text", "text", "heading + label");
eq("- text", "text", "bullet");
eq('"text"', "text", "wrapping quotes");
eq("1. first\n2. second", "first\nsecond", "bare list markers");

// ---- a label alone on its line numbers the line below it ----
eq(
  "Slide 1:\nfirst\nSlide 2:\nsecond",
  "first\nsecond",
  "carried number keeps the two slides in one slideshow",
);

// ---- must not regress hand-written scripts ----
const handWritten =
  "Nobody is coming to save you\nWake up before your excuses do\n\nAnother slideshow hook\nAnother slide";
eq(handWritten, handWritten, "unnumbered prose passes through unchanged");

// ---- an unnumbered line after a blank still breaks, even among numbers ----
eq(
  "Hook one\n1. point\n2. point\n\nHook two\n1. point",
  "Hook one\npoint\npoint\n\nHook two\npoint",
  "a blank before a non-continuing line is honoured",
);

// ---- things that must survive untouched ----
eq("Slide into my DMs", "Slide into my DMs", "label word without a separator");
eq("Post this everywhere", "Post this everywhere", "show word without a number");
eq("3.5x your reach", "3.5x your reach", "decimal is not a list marker");
eq("", "", "empty input");
eq("   \n\n  ", "", "whitespace only");

console.log("normalize-script: ok");
