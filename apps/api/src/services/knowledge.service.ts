import { AppError } from "../lib/errors.js";

/**
 * Turning an uploaded file into retrievable chunks.
 *
 * The upload path deliberately stops at the BFF rather than streaming bytes to
 * the orchestrator. Two reasons: the orchestrator takes `tenant_id` and
 * `user_id` as plain body fields — it trusts whoever calls it — so the browser
 * must never talk to it directly; and file parsing is a large, CVE-prone
 * surface that belongs in the tier that already handles untrusted input.
 *
 * Chunking is the part that decides whether retrieval works at all. Too large
 * and one chunk covers three topics, so its embedding means nothing in
 * particular; too small and a price loses the property name it belongs to.
 */

/** Roughly a paragraph or two — big enough to carry context, small enough to mean one thing. */
const TARGET_CHARS = 900;
/** Hard ceiling, so a wall of text without blank lines still gets split. */
const MAX_CHARS = 1400;
/** Carried from the previous chunk, so a fact split across a boundary survives in one of them. */
const OVERLAP_CHARS = 120;
/** Below this a chunk is noise — a heading on its own, a page number. */
const MIN_CHARS = 40;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface KnowledgeChunk {
  text: string;
  doc_id: string;
  chunk_id: string;
  source_uri: string;
  version: number;
  effective_date: string;
}

// --------------------------------------------------------------------------
// Parsing
// --------------------------------------------------------------------------
/**
 * Extensions we can turn into text here and now, with no new dependency.
 *
 * PDF and DOCX are deliberately absent rather than half-supported: both need a
 * real parser, and a regex over PDF bytes produces plausible-looking garbage
 * that would be embedded and retrieved as though it were the document. A clear
 * refusal is better than silent nonsense in the knowledge base.
 */
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "html", "htm"]);

const NEEDS_A_PARSER: Record<string, string> = {
  pdf: "PDF",
  docx: "Word (.docx)",
  doc: "legacy Word (.doc)",
  pptx: "PowerPoint",
  xlsx: "Excel",
};

export function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractText(filename: string, bytes: Uint8Array): string {
  const extension = extensionOf(filename);

  if (NEEDS_A_PARSER[extension]) {
    throw new AppError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      `${NEEDS_A_PARSER[extension]} files need a parser this deployment doesn't have yet. ` +
        `Export it as text, Markdown or CSV and upload that.`,
    );
  }
  if (!TEXT_EXTENSIONS.has(extension)) {
    throw new AppError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      `Can't read a .${extension || "?"} file. Supported: ${[...TEXT_EXTENSIONS].join(", ")}.`,
    );
  }

  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const text = extension === "html" || extension === "htm" ? stripHtml(raw) : raw;

  // A binary file renamed to .txt decodes to replacement characters. Embedding
  // that would fill the knowledge base with junk that still matches queries.
  const replacements = (text.match(/�/g) ?? []).length;
  if (replacements > text.length * 0.02) {
    throw new AppError(
      415,
      "NOT_TEXT",
      "That file doesn't appear to be text. Check the format and try again.",
    );
  }
  return text;
}

// --------------------------------------------------------------------------
// Chunking
// --------------------------------------------------------------------------
/** Split oversized blocks on sentence ends, then hard-wrap whatever remains. */
function splitLongBlock(block: string): string[] {
  if (block.length <= MAX_CHARS) return [block];
  const sentences = block.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > TARGET_CHARS) {
      out.push(current.trim());
      current = "";
    }
    // A single sentence longer than the ceiling (a table row, a run-on
    // paragraph) still has to be cut somewhere.
    if (sentence.length > MAX_CHARS) {
      for (let i = 0; i < sentence.length; i += TARGET_CHARS) {
        out.push(sentence.slice(i, i + TARGET_CHARS).trim());
      }
      continue;
    }
    current += (current ? " " : "") + sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

/**
 * Structure first, size second.
 *
 * Splitting purely on character count cuts through the middle of a sentence,
 * so a chunk starts mid-thought and its embedding drifts. Blank lines and
 * Markdown headings are where the author already said "new topic" — using them
 * costs nothing and keeps chunks about one thing.
 */
export function chunkText(text: string): string[] {
  const normalised = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalised) return [];

  // Keep a Markdown heading attached to the section it introduces — on its own
  // it is too short to survive, and the section beneath loses its subject.
  const blocks: string[] = [];
  for (const block of normalised.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const previous = blocks[blocks.length - 1];
    if (previous !== undefined && /^#{1,6}\s/.test(previous) && previous.length < 120) {
      blocks[blocks.length - 1] = `${previous}\n\n${trimmed}`;
    } else {
      blocks.push(trimmed);
    }
  }

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    const text = current.trim();
    if (text.length >= MIN_CHARS) chunks.push(text);
    else if (text && chunks.length) chunks[chunks.length - 1] += `\n\n${text}`;
    current = "";
  };

  for (const block of blocks) {
    for (const piece of splitLongBlock(block)) {
      if (current && current.length + piece.length > TARGET_CHARS) {
        const tail = current.slice(-OVERLAP_CHARS);
        flush();
        // Overlap: a price and the property it belongs to often straddle a
        // boundary, and one of the two chunks needs both.
        current = tail.includes("\n") ? tail.slice(tail.indexOf("\n") + 1).trim() : "";
      }
      current += (current ? "\n\n" : "") + piece;
    }
  }
  flush();
  return chunks;
}

// --------------------------------------------------------------------------
// Assembly
// --------------------------------------------------------------------------
/** Stable, readable, and safe as a payload value. */
export function docIdFor(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
  return slug || "document";
}

export function toChunks(filename: string, bytes: Uint8Array): KnowledgeChunk[] {
  const text = extractText(filename, bytes);
  const pieces = chunkText(text);
  if (pieces.length === 0) {
    throw new AppError(
      422,
      "EMPTY_DOCUMENT",
      "There was no readable text in that file.",
    );
  }

  const docId = docIdFor(filename);
  // The orchestrator replaces any existing chunks with the same doc_id for
  // this user, so re-uploading a corrected file retires the old version rather
  // than leaving two truths in the index.
  const effectiveDate = new Date().toISOString().slice(0, 10);
  return pieces.map((text, index) => ({
    text,
    doc_id: docId,
    chunk_id: `${docId}#${index + 1}`,
    source_uri: filename,
    version: 1,
    effective_date: effectiveDate,
  }));
}
