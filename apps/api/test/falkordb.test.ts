import assert from "node:assert/strict";
import { FalkorContextService } from "../src/services/falkordb.js";
import { MemoryRepository } from "../src/db/memory-repository.js";
import { retrieveMemories, maybeRecordMemory } from "../src/services/memory.js";

async function runTests() {
  console.log("--- Testing FalkorContextService Topic Extraction ---");
  const falkor = new FalkorContextService();

  // 1. Topic Extraction
  const physQuery = "How do I calculate friction on an inclined ramp?";
  const physExtracted = falkor.extractTopics(physQuery);
  console.log("Physics extraction:", physExtracted);
  assert.ok(physExtracted.topics.includes("Friction"), "Should extract Friction");
  assert.ok(physExtracted.topics.includes("Inclined Plane"), "Should extract Inclined Plane");

  const mathQuery = "Explain eigenvalues and matrix decomposition for my test";
  const mathExtracted = falkor.extractTopics(mathQuery);
  console.log("Math extraction:", mathExtracted);
  assert.ok(mathExtracted.topics.includes("Eigenvalues"), "Should extract Eigenvalues");
  assert.ok(mathExtracted.topics.includes("Matrix Decompositions"), "Should extract Matrix Decompositions");

  const csQuery = "How does dynamic programming optimize recursion with a call stack?";
  const csExtracted = falkor.extractTopics(csQuery);
  console.log("CS extraction:", csExtracted);
  assert.ok(csExtracted.topics.includes("Dynamic Programming"), "Should extract Dynamic Programming");
  assert.ok(csExtracted.topics.includes("Recursion"), "Should extract Recursion");
  assert.ok(csExtracted.topics.includes("Call Stack"), "Should extract Call Stack");

  // 2. Fallback memory retrieval without FalkorDB connection
  console.log("--- Testing Memory Retrieval Fallback ---");
  const repo = new MemoryRepository();
  await repo.init();

  // Seed repository with sample memory
  const mistake = await repo.upsertMemory({
    type: "mistake",
    label: "Recurring mistake",
    summary: "Repeatedly applies F = ma without net force on inclined surfaces.",
    source: "learned",
    keywords: ["net", "force", "inclined", "friction"],
  });

  const retrieved = await retrieveMemories(repo, "I am struggling with net force on an inclined plane", 4, falkor);
  console.log("Fallback retrieved:", retrieved);
  assert.equal(retrieved.items.length, 1, "Should find 1 memory via fallback");
  assert.equal(retrieved.items[0]!.id, mistake.id, "Should match the seeded mistake");
  assert.ok(retrieved.note?.includes("recurring mistake"), "Note should mention recurring mistake");

  // 3. Learning memory from user chat message
  console.log("--- Testing Signal Recording ---");
  const recorded = await maybeRecordMemory(repo, {
    conversationId: "conv_123",
    messageId: "msg_123",
    text: "I keep getting eigenvalue determinants wrong",
  }, falkor);

  console.log("Recorded memory:", recorded);
  assert.ok(recorded !== null, "Should record durable signal");
  assert.equal(recorded?.type, "mistake");
  assert.ok(recorded?.summary.includes("eigenvalue determinants wrong"));

  console.log("\n All FalkorDB context service checks passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
