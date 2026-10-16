import { FalkorDB, type Graph } from "falkordb";
import type { StudyMemory, StudyMemorySource, StudyMemoryType } from "@recallai/shared-types";
import { config } from "../config.js";
import { keywordsOf } from "../db/repository.js";

/**
 * FalkorDB-backed Context and Memory Engine for RecallAI.
 *
 * Implements graph-backed persistent memory using OpenCypher. Connects study
 * memories (goals, mistakes, studied topics) to a knowledge graph of academic
 * concepts and relationships.
 *
 * When a student asks a question, this service traverses concept connections
 * (e.g. Inclined Plane -> Net Force -> Recurring Mistake) to recall relevant
 * context across sessions and explain the connection in plain language.
 */

export interface GraphContextRetrieval {
  items: StudyMemory[];
  note?: string;
  source: "falkordb" | "fallback";
}

interface GraphRow {
  id: string;
  type: StudyMemoryType;
  label: string;
  summary: string;
  source?: StudyMemorySource;
  updatedAt?: string;
  topicName?: string;
  matchedTopicName?: string;
  relType?: string;
  distance?: number;
  edgeReason?: string;
}

/** Predefined concept dictionary mapping common student phrases to canonical topics. */
const CONCEPT_MAPPINGS: Array<{ re: RegExp; topic: string; category: string }> = [
  // Physics
  { re: /\b(net force|resultant force|unbalanced force)\b/i, topic: "Net Force", category: "Physics" },
  { re: /\b(friction|frictional|kinetic friction|static friction|coefficient of friction)\b/i, topic: "Friction", category: "Physics" },
  { re: /\b(inclined|ramp|incline|slope|inclined plane|wedge)\b/i, topic: "Inclined Plane", category: "Physics" },
  { re: /\b(newton'?s? (first|second|third|law|laws)|f\s*=\s*m\s*a)\b/i, topic: "Newton's Laws", category: "Physics" },
  { re: /\b(momentum|impulse|collision|elastic collision|inelastic)\b/i, topic: "Momentum", category: "Physics" },
  { re: /\b(torque|rotational|moment of inertia|angular momentum)\b/i, topic: "Torque", category: "Physics" },
  { re: /\b(quantum|photon|photons|photoelectric|double[- ]slit|interference|wave[- ]particle)\b/i, topic: "Quantum Interference", category: "Physics" },
  { re: /\b(photon momentum|de broglie|planck)\b/i, topic: "Photon Momentum", category: "Physics" },

  // Mathematics
  { re: /\b(eigen|eigenvalue|eigenvalues|eigenvector|eigenvectors|characteristic equation)\b/i, topic: "Eigenvalues", category: "Mathematics" },
  { re: /\b(matrix|matrices|decomposition|svd|singular value|diagonalization|lu decomposition)\b/i, topic: "Matrix Decompositions", category: "Mathematics" },
  { re: /\b(determinant|determinants|cramer'?s? rule)\b/i, topic: "Determinants", category: "Mathematics" },
  { re: /\b(linear algebra|vector space|basis|span|linear transformation)\b/i, topic: "Linear Algebra", category: "Mathematics" },
  { re: /\b(derivative|derivatives|differentiation|chain rule|gradient)\b/i, topic: "Derivatives", category: "Mathematics" },
  { re: /\b(integral|integrals|integration|anti[- ]derivative)\b/i, topic: "Integrals", category: "Mathematics" },

  // Computer Science & Programming
  { re: /\b(python|pythonic|pip)\b/i, topic: "Python", category: "Computer Science" },
  { re: /\b(dictionary|dictionaries|dict|key[- ]value|hashmap|hash map|hash table)\b/i, topic: "Dictionaries", category: "Computer Science" },
  { re: /\b(dictionary methods?|\.get\(|\.items\(|\.keys\(|\.values\(|\.update\()\b/i, topic: "Dictionary Methods", category: "Computer Science" },
  { re: /\b(machine learning|ai|ml|artificial intelligence|deep learning|neural network|neural net)\b/i, topic: "Machine Learning", category: "Computer Science" },
  { re: /\b(recursion|recursive|base case|recurrence)\b/i, topic: "Recursion", category: "Computer Science" },
  { re: /\b(call stack|stack frame|stack overflow)\b/i, topic: "Call Stack", category: "Computer Science" },
  { re: /\b(dynamic programming|memoization|tabulation|optimal substructure)\b/i, topic: "Dynamic Programming", category: "Computer Science" },
  { re: /\b(binary tree|bst|tree traversal|heap)\b/i, topic: "Trees", category: "Computer Science" },
  { re: /\b(big o|time complexity|space complexity|asymptotic)\b/i, topic: "Time Complexity", category: "Computer Science" },
  { re: /\b(data structures?|algorithms?)\b/i, topic: "Data Structures", category: "Computer Science" },
];

/** Concept ontology edges defining structural relationships between topics. */
const CORE_ONTOLOGY_EDGES = [
  {
    from: "Newton's Laws",
    to: "Net Force",
    type: "PREREQUISITE_OF",
    reason: "Newton's second law formally defines net force as the product of mass and acceleration.",
  },
  {
    from: "Net Force",
    to: "Friction",
    type: "CONNECTED_TO",
    reason: "Friction is a component force that opposes motion and contributes to net force.",
  },
  {
    from: "Inclined Plane",
    to: "Friction",
    type: "CONNECTED_TO",
    reason: "Inclined plane calculations require resolving normal force to determine friction opposing the parallel motion.",
  },
  {
    from: "Inclined Plane",
    to: "Net Force",
    type: "CONNECTED_TO",
    reason: "Inclined plane acceleration requires calculating net force along the axis parallel to the ramp.",
  },
  {
    from: "Momentum",
    to: "Net Force",
    type: "CONNECTED_TO",
    reason: "Net force equals the rate of change of momentum over time.",
  },
  {
    from: "Torque",
    to: "Net Force",
    type: "CONNECTED_TO",
    reason: "Torque is the rotational analogue of net force.",
  },
  {
    from: "Determinants",
    to: "Eigenvalues",
    type: "PREREQUISITE_OF",
    reason: "Calculating eigenvalues requires evaluating the characteristic determinant det(A - lambda*I) = 0.",
  },
  {
    from: "Eigenvalues",
    to: "Matrix Decompositions",
    type: "CONNECTED_TO",
    reason: "Eigenvalues and eigenvectors form the foundation of eigendecomposition and singular value decomposition.",
  },
  {
    from: "Matrix Decompositions",
    to: "Linear Algebra",
    type: "CONNECTED_TO",
    reason: "Matrix decompositions are a core pillar of applied linear algebra.",
  },
  {
    from: "Photon Momentum",
    to: "Quantum Interference",
    type: "CONNECTED_TO",
    reason: "Photons carry momentum p = h/lambda which governs wavelength and interference fringes.",
  },
  {
    from: "Recursion",
    to: "Call Stack",
    type: "CONNECTED_TO",
    reason: "Every recursive call allocates a new frame on the system call stack.",
  },
  {
    from: "Recursion",
    to: "Dynamic Programming",
    type: "CONNECTED_TO",
    reason: "Dynamic programming solves overlapping subproblems that originate from recursive formulations.",
  },
  {
    from: "Dictionary Methods",
    to: "Dictionaries",
    type: "CONNECTED_TO",
    reason: "Dictionary methods provide the key operations and API for dictionary data structures.",
  },
  {
    from: "Dictionaries",
    to: "Python",
    type: "CONNECTED_TO",
    reason: "Dictionaries are one of Python's fundamental built-in mapping data structures.",
  },
  {
    from: "Python",
    to: "Data Structures",
    type: "CONNECTED_TO",
    reason: "Python provides built-in collections and primitives for implementing data structures.",
  },
];

export class FalkorContextService {
  private client: FalkorDB | null = null;
  private graph: Graph | null = null;
  private connected = false;
  private initPromise: Promise<void> | null = null;

  get isConnected(): boolean {
    return this.connected;
  }

  get graphName(): string {
    return config.falkordbGraph;
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    if (!config.hasFalkorDB) {
      console.log("[falkordb] No FALKORDB_URL or FALKORDB_HOST configured — using in-memory keyword fallback.");
      return;
    }

    try {
      console.log(`[falkordb] Connecting to FalkorDB...`);

      let connectionOptions: Parameters<typeof FalkorDB.connect>[0];

      if (config.falkordbUrl) {
        // e.g. rediss://default:password@host:port or redis://... or falkor://...
        connectionOptions = { url: config.falkordbUrl };
      } else {
        connectionOptions = {
          host: config.falkordbHost,
          port: config.falkordbPort,
          username: config.falkordbUsername || undefined,
          password: config.falkordbPassword || undefined,
          ...(config.falkordbTls ? { socket: { tls: true } } : {}),
        };
      }

      this.client = await FalkorDB.connect(connectionOptions);
      this.client.on("error", (err: unknown) => {
        console.warn(`[falkordb] Socket event (${err instanceof Error ? err.message : String(err)})`);
      });
      this.graph = this.client.selectGraph(this.graphName);
      this.connected = true;

      console.log(`[falkordb] Connected successfully. Selected graph: '${this.graphName}'`);

      // Ensure indexes and initial academic ontology
      await this.ensureIndexes();
      await this.seedOntology();
      await this.seedInitialMemoriesIfEmpty();
    } catch (err) {
      this.connected = false;
      this.client = null;
      this.graph = null;
      console.warn(`[falkordb] Failed to connect to FalkorDB (${err instanceof Error ? err.message : err}). Falling back to repository keyword matching.`);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* ignore close errors on shutdown */
      }
      this.client = null;
      this.graph = null;
      this.connected = false;
    }
  }

  /** Ensures range indexes for fast node lookups. */
  private async ensureIndexes(): Promise<void> {
    if (!this.graph) return;
    try {
      await this.graph.createNodeRangeIndex("Memory", "id").catch(() => {});
      await this.graph.createNodeRangeIndex("Topic", "name").catch(() => {});
    } catch {
      // Index already exists or non-fatal
    }
  }

  /** Seeds the core academic concept graph ontology with prerequisite and connection edges. */
  async seedOntology(): Promise<void> {
    if (!this.graph) return;
    try {
      // 1. Create concept topic nodes
      for (const m of CONCEPT_MAPPINGS) {
        await this.graph.query(
          `MERGE (t:Topic {name: $name}) ON CREATE SET t.category = $category`,
          { params: { name: m.topic, category: m.category } },
        );
      }

      // 2. Create relationship edges
      for (const edge of CORE_ONTOLOGY_EDGES) {
        if (edge.type === "PREREQUISITE_OF") {
          await this.graph.query(
            `MATCH (a:Topic {name: $from}), (b:Topic {name: $to})
             MERGE (a)-[r:PREREQUISITE_OF]->(b)
             ON CREATE SET r.reason = $reason`,
            { params: { from: edge.from, to: edge.to, reason: edge.reason } },
          );
        } else {
          await this.graph.query(
            `MATCH (a:Topic {name: $from}), (b:Topic {name: $to})
             MERGE (a)-[r:CONNECTED_TO]->(b)
             ON CREATE SET r.reason = $reason`,
            { params: { from: edge.from, to: edge.to, reason: edge.reason } },
          );
        }
      }
    } catch (err) {
      console.warn("[falkordb] Warning while seeding ontology:", err);
    }
  }

  /** Seeds initial demonstration memories if the graph has none. */
  private async seedInitialMemoriesIfEmpty(): Promise<void> {
    if (!this.graph) return;
    try {
      const res = await this.graph.query<{ count: number }>(
        `MATCH (m:Memory) RETURN count(m) AS count`,
      );
      const count = Number(res.data?.[0]?.count ?? 0);
      if (count > 0) return;

      console.log("[falkordb] Seeding initial study memories in graph...");

      // 1. Recurring mistake: Newton's second law on inclined surfaces
      await this.upsertMemory({
        id: "mem_mistake_newton",
        type: "mistake",
        label: "Recurring mistake",
        summary: "Repeatedly applies F = ma without the net-force qualifier, which breaks on inclined surfaces.",
        source: "learned",
        updatedAt: new Date(Date.now() - 864e5 * 2).toISOString(),
      }, {
        topics: ["Net Force", "Newton's Laws"],
      });

      // 2. Study goal: Linear algebra exam
      await this.upsertMemory({
        id: "mem_goal_exam",
        type: "goal",
        label: "Current study goal",
        summary: "Revise for a linear-algebra exam in about two weeks, focusing on eigenvalues and matrix decompositions.",
        source: "learned",
        updatedAt: new Date(Date.now() - 864e5 * 3).toISOString(),
      }, {
        topics: ["Linear Algebra", "Eigenvalues", "Matrix Decompositions"],
      });

      // 3. Recently studied topic: Photon momentum and interference
      await this.upsertMemory({
        id: "mem_topic_photons",
        type: "topic",
        label: "Recently studied topic",
        summary: "Worked through double-slit interference and photon momentum. Comfortable with the maths, still shaky on the intuition.",
        source: "learned",
        updatedAt: new Date(Date.now() - 864e5 * 5).toISOString(),
      }, {
        topics: ["Quantum Interference", "Photon Momentum"],
      });
    } catch (err) {
      console.warn("[falkordb] Error seeding initial memories:", err);
    }
  }

  /**
   * Extracts canonical topic names and concept keywords from arbitrary text.
   */
  extractTopics(text: string): { topics: string[]; keywords: string[] } {
    const matchedTopics = new Set<string>();

    for (const m of CONCEPT_MAPPINGS) {
      if (m.re.test(text)) {
        matchedTopics.add(m.topic);
      }
    }

    const keywords = keywordsOf(text);
    return {
      topics: Array.from(matchedTopics),
      keywords,
    };
  }

  /**
   * Inserts or updates a study memory in the graph, linking it to relevant Topic nodes and Student node.
   */
  async upsertMemory(
    memory: StudyMemory,
    options?: {
      conversationId?: string;
      messageId?: string;
      topics?: string[];
      keywords?: string[];
      userId?: string;
    },
  ): Promise<void> {
    if (!this.graph) return;

    try {
      const nowIso = memory.updatedAt || new Date().toISOString();
      const derived = this.extractTopics(memory.summary);
      const targetTopics = options?.topics?.length
        ? options.topics
        : derived.topics.length
          ? derived.topics
          : [];

      // 1. Upsert Memory node with userId
      await this.graph.query(
        `MERGE (m:Memory {id: $id})
         SET m.type = $type,
             m.label = $label,
             m.summary = $summary,
             m.source = $source,
             m.conversationId = $conversationId,
             m.messageId = $messageId,
             m.userId = $userId,
             m.updatedAt = $updatedAt`,
        {
          params: {
            id: memory.id,
            type: memory.type,
            label: memory.label,
            summary: memory.summary,
            source: memory.source ?? "learned",
            conversationId: options?.conversationId ?? "",
            messageId: options?.messageId ?? "",
            userId: options?.userId ?? "",
            updatedAt: nowIso,
          },
        },
      );

      // Connect to Student node if userId present
      if (options?.userId) {
        await this.graph.query(
          `MERGE (s:Student {id: $userId})
           MERGE (m:Memory {id: $memoryId})
           MERGE (s)-[:HAS_MEMORY]->(m)`,
          { params: { userId: options.userId, memoryId: memory.id } },
        );
      }

      // 2. Link to Topics
      for (const topicName of targetTopics) {
        await this.graph.query(
          `MERGE (t:Topic {name: $topicName})
           MERGE (m:Memory {id: $memoryId})
           MERGE (m)-[:RELATES_TO]->(t)`,
          { params: { topicName, memoryId: memory.id } },
        );

        if (memory.type === "mistake") {
          await this.graph.query(
            `MATCH (m:Memory {id: $memoryId}), (t:Topic {name: $topicName})
             MERGE (m)-[:RECURRING_MISTAKE_IN]->(t)`,
            { params: { memoryId: memory.id, topicName } },
          );
        } else if (memory.type === "goal") {
          await this.graph.query(
            `MATCH (m:Memory {id: $memoryId}), (t:Topic {name: $topicName})
             MERGE (m)-[:TARGETS_GOAL]->(t)`,
            { params: { memoryId: memory.id, topicName } },
          );
        }
      }
    } catch (err) {
      console.warn("[falkordb] Failed to upsert memory into graph:", err);
    }
  }

  /**
   * Deletes a memory from the graph by id.
   */
  async deleteMemory(id: string): Promise<boolean> {
    if (!this.graph) return false;
    try {
      const res = await this.graph.query(
        `MATCH (m:Memory {id: $id}) DETACH DELETE m RETURN count(m) AS deleted`,
        { params: { id } },
      );
      return Boolean(res.data?.length);
    } catch (err) {
      console.warn("[falkordb] Failed to delete memory from graph:", err);
      return false;
    }
  }

  /**
   * Lists all memories recorded in the graph, optionally filtered by conversationId and userId.
   */
  async listMemories(conversationId?: string, userId?: string): Promise<StudyMemory[]> {
    if (!this.graph) return [];
    try {
      let cypher = `MATCH (m:Memory) WHERE 1=1 `;
      const params: Record<string, any> = {};
      if (conversationId) {
        cypher += `AND m.conversationId = $conversationId `;
        params.conversationId = conversationId;
      }
      if (userId) {
        if (userId === "default_student") {
          cypher += `AND (m.userId = $userId OR m.userId IS NULL OR m.userId = '') `;
        } else {
          cypher += `AND m.userId = $userId `;
        }
        params.userId = userId;
      }
      cypher += `RETURN m.id AS id, m.type AS type, m.label AS label, m.summary AS summary, m.source AS source, m.updatedAt AS updatedAt ORDER BY m.updatedAt DESC`;

      const res = await this.graph.query<GraphRow>(cypher, { params });

      return (res.data ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        label: r.label,
        summary: r.summary,
        source: r.source ?? "learned",
        updatedAt: r.updatedAt,
      }));
    } catch (err) {
      console.warn("[falkordb] Error listing memories:", err);
      return [];
    }
  }

  /**
   * Retrieves relevant memory items using graph traversal.
   *
   * Traversal order:
   * 1. Direct matches: Memories directly linked to topics in query OR containing keywords in summary.
   * 2. Connected concept matches (1-hop / 2-hop): Memories linked to topics that
   *    are prerequisites or connected concepts of topics in the query.
   * 3. Explains the connection in plain language using edge metadata.
   */
  async retrieveContext(query: string, limit = 4, userId?: string): Promise<GraphContextRetrieval> {
    if (!this.graph) return { items: [], source: "fallback" };

    const candidates: Map<string, GraphRow> = new Map();
    const explanationNotes: string[] = [];

    const userClause = userId && userId !== "default_student"
      ? `m.userId = $userId`
      : userId === "default_student"
        ? `(m.userId = $userId OR m.userId IS NULL OR m.userId = '')`
        : `1=1`;

    // Check if query is asking for learning continuity or what to practice / work on next
    const isContinuityQuery =
      /\b(?:what\s+should\s+i\s+(?:practise|practice|study|review|work\s+on|learn)|where\s+should\s+i\s+(?:start|begin|pick\s+up|continue)|what\s+next|next\s+step|what\s+to\s+(?:practise|practice|study)|what\s+are\s+my\s+(?:weak\s+areas|mistakes)|what\s+did\s+i\s+(?:get\s+wrong|struggle\s+with))\b/i.test(query);

    if (isContinuityQuery) {
      try {
        const contRes = await this.graph.query<GraphRow>(
          `MATCH (m:Memory)
           WHERE ${userClause}
           OPTIONAL MATCH (m)-[r:RELATES_TO|TARGETS_GOAL|RECURRING_MISTAKE_IN]->(t:Topic)
           RETURN m.id AS id, m.type AS type, m.label AS label, m.summary AS summary,
                  m.source AS source, m.updatedAt AS updatedAt,
                  coalesce(t.name, '') AS topicName, coalesce(type(r), '') AS relType, 1 AS distance, '' AS edgeReason
           ORDER BY CASE m.type WHEN 'mistake' THEN 1 WHEN 'goal' THEN 2 ELSE 3 END, m.updatedAt DESC
           LIMIT $limit`,
          { params: { userId: userId ?? "", limit } },
        );

        for (const row of contRes.data ?? []) {
          if (!candidates.has(row.id)) {
            candidates.set(row.id, row);
            if (row.type === "mistake") {
              explanationNotes.push(`Anchored in a previous topic you struggled with${row.topicName ? `: ${row.topicName}` : ""}.`);
            } else if (row.type === "goal") {
              explanationNotes.push(`Anchored in your recorded study goal${row.topicName ? `: ${row.topicName}` : ""}.`);
            } else {
              explanationNotes.push(`Built on material you studied recently${row.topicName ? `: ${row.topicName}` : ""}.`);
            }
          }
        }

        if (candidates.size > 0) {
          const items: StudyMemory[] = Array.from(candidates.values()).slice(0, limit).map((r) => ({
            id: r.id,
            type: r.type,
            label: r.label,
            summary: r.summary,
            source: r.source ?? "learned",
            updatedAt: r.updatedAt,
          }));
          const note = [...new Set(explanationNotes)].join(" ") || "Anchored in your previous learning and mistakes.";
          return { items, note, source: "falkordb" };
        }
      } catch (err) {
        console.warn("[falkordb] Continuity retrieval error:", err);
      }
    }

    const { topics, keywords } = this.extractTopics(query);
    if (topics.length === 0 && keywords.length === 0) {
      return { items: [], source: "falkordb" };
    }

    const topicNamesLower = topics.map((t) => t.toLowerCase());

    try {
      // 1. Direct matches (by topic name or keywords in summary), with OPTIONAL MATCH to Topic so memories without Topic nodes are preserved!
      if (topicNamesLower.length > 0 || keywords.length > 0) {
        const directRes = await this.graph.query<GraphRow>(
          `MATCH (m:Memory)
           WHERE ${userClause}
           OPTIONAL MATCH (m)-[r:RELATES_TO|TARGETS_GOAL|RECURRING_MISTAKE_IN]->(t:Topic)
           WHERE (size($keywords) > 0 AND any(kw IN $keywords WHERE toLower(m.summary) CONTAINS kw))
              OR (size($topics) > 0 AND t IS NOT NULL AND toLower(t.name) IN $topics)
           RETURN m.id AS id, m.type AS type, m.label AS label, m.summary AS summary,
                  m.source AS source, m.updatedAt AS updatedAt,
                  coalesce(t.name, '') AS topicName, coalesce(type(r), '') AS relType, 1 AS distance, '' AS edgeReason
           ORDER BY m.updatedAt DESC
           LIMIT $limit`,
          {
            params: {
              userId: userId ?? "",
              topics: topicNamesLower,
              keywords: keywords.map((k) => k.toLowerCase()),
              limit,
            },
          },
        );

        for (const row of directRes.data ?? []) {
          if (!candidates.has(row.id)) {
            candidates.set(row.id, row);
            if (row.type === "mistake") {
              explanationNotes.push(`Used a recurring mistake you logged on ${row.topicName || "this topic"}.`);
            } else if (row.type === "goal") {
              explanationNotes.push(`Anchored in your recorded study goal for ${row.topicName || "this subject"}.`);
            } else {
              explanationNotes.push(`Built on the ${row.topicName || "material"} you studied recently.`);
            }
          }
        }
      }

      // 2. Connected concept traversal (multi-hop)
      if (topicNamesLower.length > 0 && candidates.size < limit) {
        const remainingLimit = limit - candidates.size;
        const connectedRes = await this.graph.query<GraphRow>(
          `MATCH (m:Memory)-[r:RELATES_TO|TARGETS_GOAL|RECURRING_MISTAKE_IN]->(t1:Topic)-[c:CONNECTED_TO|PREREQUISITE_OF]-(t2:Topic)
           WHERE ${userClause}
             AND toLower(t2.name) IN $topics AND NOT toLower(t1.name) IN $topics
           RETURN m.id AS id, m.type AS type, m.label AS label, m.summary AS summary,
                  m.source AS source, m.updatedAt AS updatedAt,
                  t1.name AS topicName, t2.name AS matchedTopicName,
                  type(r) AS relType, 2 AS distance, coalesce(c.reason, '') AS edgeReason
           ORDER BY CASE m.type WHEN 'mistake' THEN 1 WHEN 'goal' THEN 2 ELSE 3 END, m.updatedAt DESC
           LIMIT $limit`,
          {
            params: {
              userId: userId ?? "",
              topics: topicNamesLower,
              limit: remainingLimit,
            },
          },
        );

        for (const row of connectedRes.data ?? []) {
          if (!candidates.has(row.id)) {
            candidates.set(row.id, row);
            if (row.edgeReason) {
              if (row.type === "mistake") {
                explanationNotes.push(`Connected your recurring mistake on ${row.topicName}: ${row.edgeReason}`);
              } else {
                explanationNotes.push(`Connected from ${row.topicName} to ${row.matchedTopicName}: ${row.edgeReason}`);
              }
            } else {
              explanationNotes.push(`Connected previous study of ${row.topicName} with ${row.matchedTopicName}.`);
            }
          }
        }
      }

      const items: StudyMemory[] = Array.from(candidates.values())
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          type: r.type,
          label: r.label,
          summary: r.summary,
          source: r.source ?? "learned",
          updatedAt: r.updatedAt,
        }));

      if (items.length === 0) {
        return { items: [], source: "falkordb" };
      }

      const note = [...new Set(explanationNotes)].join(" ") || "Used notes from topics you have studied before.";
      return { items, note, source: "falkordb" };
    } catch (err) {
      console.warn("[falkordb] Graph retrieval error:", err);
      return { items: [], source: "fallback" };
    }
  }
}

/** Global singleton instance for the API process. */
export const falkorContext = new FalkorContextService();
