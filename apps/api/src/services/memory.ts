import type { StudyMemory } from "@recallai/shared-types";
import { keywordsOf, type Repository } from "../db/repository.js";
import { falkorContext, type FalkorContextService } from "./falkordb.js";

/**
 * Memory retrieval and recording.
 * Uses FalkorDB when connected, with repository keyword search as fallback.
 */

const SIGNAL_PATTERNS: Array<{
  re: RegExp;
  type: StudyMemory["type"];
  label: string;
  note: string;
}> = [
  {
    re: /\b(exam|revision|revise|deadline|test|midterm|final|course)\b/i,
    type: "goal",
    label: "Current study goal",
    note: "Anchored in your recorded study goal.",
  },
  {
    re: /\b(net force|inclined|ramp|friction|momentum|torque)\b/i,
    type: "mistake",
    label: "Recurring mistake",
    note: "Used a recurring mistake you logged.",
  },
  {
    re: /\b(eigen|matrix|matrices|determinant|singular|svd|decomposition|linear algebra)\b/i,
    type: "topic",
    label: "Recently studied topic",
    note: "Built on the linear algebra you have been studying.",
  },
  {
    re: /\b(quantum|photon|interference|spectr|relativ)\b/i,
    type: "topic",
    label: "Recently studied topic",
    note: "Built on the quantum material you studied recently.",
  },
];

// Explicit memory requests, e.g.:
// "Remember this fact for future conversations: my study code is PHYSICS-731."
const MEMORY_PREFIX =
  /^\s*(?:please\s+)?(?:remember|save|store|don't\s+forget)\b\s*(?:(?:this\s+fact|this|that|the\s+following)\b)?\s*(?:for\s+future\s+conversations?\b)?\s*[:\-]?\s*([\s\S]+)$/i;

const MEMORY_SUFFIX =
  /[\s,.]*(?:please\s+)?(?:save|store)\s+it\s+(?:to|in)\s+(?:long[-\s]?term)\s+memory\.?\s*$/i;

const MIN_LEN = 5;
const MAX_LEN = 300;

// Recurring mistakes, e.g.: "I keep getting Newton's laws wrong."
const MISTAKE_PATTERN =
  /\b(?:keep|always|repeatedly|constantly)\s+(?:getting|forgetting|mixing up|confusing)\b([^.,;!?]{3,80})/i;

function extractExplicitMemory(text: string): string | null {
  const trimmed = text.trim();

  // Case 1: Prefix ("Remember that...", "Remember: ...", "Please store in memory: ...")
  const prefixMatch = trimmed.match(
    /^\s*(?:please\s+)?(?:remember|save|store|don't\s+forget|note\s+down)\b\s*(?:(?:this\s+fact|this|that|the\s+following)\b)?\s*(?:for\s+future\s+conversations?\b)?\s*[:\-]?\s*([\s\S]+)$/i,
  );
  if (prefixMatch && prefixMatch[1]) {
    const summary = prefixMatch[1]
      .replace(/[\s,.]*(?:please\s+)?(?:save|store)\s+it\s+(?:to|in)\s+(?:long[-\s]?term\s+)?memory\.?\s*$/i, "")
      .replace(/[\s,.]*(?:please\s+)?(?:remember|save|keep)\s+(?:this|that)\.?\s*$/i, "")
      .trim();

    if (summary.length >= MIN_LEN && summary.length <= MAX_LEN) {
      return summary;
    }
  }

  // Case 2: Suffix ("My name is Rishu. I am a BTech CSE AI-ML student. Remember this.")
  const suffixMatch = trimmed.match(
    /^([\s\S]+?)[,.]?\s+(?:please\s+)?(?:remember|save|store|keep|record)\s+(?:this|that|it|these\s+facts?)(?:\s+(?:for\s+future\s+conversations?|in\s+mind|to\s+memory|in\s+long[-\s]?term\s+memory))?\.?\s*$/i,
  );
  if (suffixMatch && suffixMatch[1]) {
    const summary = suffixMatch[1].trim();
    if (summary.length >= MIN_LEN && summary.length <= MAX_LEN) {
      return summary;
    }
  }

  return null;
}

const MISTAKE_WRONG_PATTERN =
  /\b(?:i\s+)?(?:got|getting|made\s+a\s+mistake\s+(?:in|on)|struggled\s+with)\s+(?:a\s+question\s+(?:about|on)\s+)?([^.,;!?]{3,100})\s+wrong\b/i;

const MISTAKE_STRUGGLE_PATTERN =
  /\b(?:i\s+(?:am\s+)?struggling\s+with|struggled\s+with|keep\s+struggling\s+with)\s+([^.,;!?]{3,80})/i;

export async function retrieveMemories(
  repo: Repository,
  query: string,
  limit = 4,
  falkor: FalkorContextService = falkorContext,
  userId?: string,
): Promise<{ items: StudyMemory[]; note?: string }> {
  // 1. Try FalkorDB first.
  if (falkor.isConnected) {
    const graphResult = await falkor.retrieveContext(query, limit, userId);

    if (graphResult.items.length > 0) {
      return {
        items: graphResult.items,
        note: graphResult.note,
      };
    }
  }

  // 2. Fall back to repository keyword search.
  const keywords = keywordsOf(query);

  // If query is asking what to practise or study next, retrieve recent memories from repo
  const isContinuity =
    /\b(?:what\s+should\s+i\s+(?:practise|practice|study|review|work\s+on|learn)|where\s+should\s+i\s+(?:start|begin|pick\s+up|continue)|what\s+next|next\s+step|what\s+to\s+(?:practise|practice|study)|what\s+are\s+my\s+(?:weak\s+areas|mistakes)|what\s+did\s+i\s+(?:get\s+wrong|struggle\s+with))\b/i.test(query);

  if (isContinuity) {
    const all = await repo.listMemories(undefined, userId);
    if (all.length > 0) {
      const sorted = [...all].sort((a, b) => {
        const score = (m: StudyMemory) => (m.type === "mistake" ? 3 : m.type === "goal" ? 2 : 1);
        return score(b) - score(a);
      });
      return {
        items: sorted.slice(0, limit),
        note: "Anchored in your previous learning and recorded weak areas.",
      };
    }
  }

  if (keywords.length === 0) {
    return { items: [] };
  }

  const items = await repo.findMemoriesByKeywords(keywords, limit, userId);

  if (items.length === 0) {
    return { items: [] };
  }

  const notes: string[] = [];

  for (const pattern of SIGNAL_PATTERNS) {
    if (pattern.re.test(query)) {
      notes.push(pattern.note);
    }
  }

  if (notes.length === 0) {
    notes.push("Used notes from topics you have studied before.");
  }

  return {
    items,
    note: [...new Set(notes)].join(" "),
  };
}

/**
 * Saves explicit user memories and recurring mistakes.
 */
export async function maybeRecordMemory(
  repo: Repository,
  input: {
    conversationId: string;
    messageId: string;
    text: string;
    userId?: string;
  },
  falkor: FalkorContextService = falkorContext,
  userId?: string,
): Promise<StudyMemory | null> {
  const effectiveUserId = input.userId ?? userId;
  const { text } = input;

  // 1. Explicit memory request
  const summary = extractExplicitMemory(text);

  if (summary) {
    const keywords = keywordsOf(summary);
    const derived = falkor.extractTopics(summary);

    const memory = await repo.upsertMemory({
      type: "topic",
      label: "Saved personal fact",
      summary,
      source: "learned",
      conversationId: input.conversationId,
      messageId: input.messageId,
      userId: effectiveUserId,
      keywords,
    });

    if (falkor.isConnected) {
      await falkor.upsertMemory(memory, {
        conversationId: input.conversationId,
        messageId: input.messageId,
        userId: effectiveUserId,
        keywords,
        topics: derived.topics,
      });
    }

    return memory;
  }

  // 2. Recurring mistake
  let mistakeSubject = "";
  const match1 = text.match(MISTAKE_PATTERN);
  const match2 = text.match(MISTAKE_WRONG_PATTERN);
  const match3 = text.match(MISTAKE_STRUGGLE_PATTERN);

  if (match1 && match1[1]) {
    mistakeSubject = match1[1];
  } else if (match2 && match2[1]) {
    mistakeSubject = match2[1];
  } else if (match3 && match3[1]) {
    mistakeSubject = match3[1];
  }

  if (mistakeSubject) {
    const subject = mistakeSubject
      .replace(/^\s*(?:this|that|it|them)\s+/i, "")
      .trim();

    if (subject) {
      const keywords = keywordsOf(subject);
      const derived = falkor.extractTopics(subject + " " + text);

      const memory = await repo.upsertMemory({
        type: "mistake",
        label: "Recurring mistake",
        summary: `You reported struggling with or getting this wrong: ${subject}.`,
        source: "learned",
        conversationId: input.conversationId,
        messageId: input.messageId,
        userId: effectiveUserId,
        keywords,
      });

      if (falkor.isConnected) {
        await falkor.upsertMemory(memory, {
          conversationId: input.conversationId,
          messageId: input.messageId,
          userId: effectiveUserId,
          keywords,
          topics: derived.topics,
        });
      }

      return memory;
    }
  }

  return null;
}
