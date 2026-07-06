import { PAUSE_COMMA_MS, PAUSE_SENTENCE_MS } from '../surface/surface-options';

export interface WordToken {
  /** The word including trailing punctuation. */
  text: string;
  /** Explicit line break BEFORE this word. */
  newlinesBefore: number;
  /** Thoughtful-pen pause after this word, ms. */
  pauseAfterMs: number;
}

export function pauseAfter(word: string): number {
  const last = word[word.length - 1];
  if (last === '.' || last === '!' || last === '?') return PAUSE_SENTENCE_MS;
  if (last === ',') return PAUSE_COMMA_MS;
  return 0;
}

/**
 * Incremental tokenizer: feed chunks of streamed text, pull complete words.
 * A word is complete once followed by whitespace; flush() drains the tail.
 */
export class Tokenizer {
  private buffer = '';
  private pendingNewlines = 0;

  push(chunk: string): WordToken[] {
    this.buffer += chunk;
    const out: WordToken[] = [];
    let i = 0;
    let wordStart = -1;
    let lastEmit = 0;
    for (i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        if (wordStart >= 0) {
          out.push(this.makeToken(this.buffer.slice(wordStart, i)));
          wordStart = -1;
        }
        if (ch === '\n') this.pendingNewlines++;
        lastEmit = i + 1;
      } else if (wordStart < 0) {
        wordStart = i;
      }
    }
    // keep the trailing partial word (or nothing) in the buffer
    void lastEmit;
    this.buffer = wordStart >= 0 ? this.buffer.slice(wordStart) : '';
    return out;
  }

  /** Emit any trailing partial word (end of stream). */
  flush(): WordToken[] {
    const tail = this.buffer.trim();
    this.buffer = '';
    if (!tail) return [];
    return [this.makeToken(tail)];
  }

  private makeToken(text: string): WordToken {
    const token: WordToken = {
      text,
      newlinesBefore: this.pendingNewlines,
      pauseAfterMs: pauseAfter(text),
    };
    this.pendingNewlines = 0;
    return token;
  }
}
