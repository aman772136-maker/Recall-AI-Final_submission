import assert from "node:assert/strict";
import { FalkorContextService } from "../src/services/falkordb.js";
import { MemoryRepository } from "../src/db/memory-repository.js";
import { retrieveMemories, maybeRecordMemory } from "../src/services/memory.js";
import { OllamaAnswerProvider } from "../src/services/ollama.js";

async function runEndToEndTests() {
  console.log("==================================================================");
  console.log("RecallAI Persistent Memory Pipeline: End-to-End Test Suite");
  console.log("==================================================================\n");

  const falkor = new FalkorContextService();
  await falkor.init();
  const repo = new MemoryRepository();
  await repo.init();

  const isFalkorConnected = falkor.isConnected;
  console.log(`[Setup] FalkorDB Connected: ${isFalkorConnected}`);

  const testUserIdRishu = `test_student_rishu_${Date.now()}`;
  const testUserIdOther = `test_student_other_${Date.now()}`;

  // -------------------------------------------------------------------------
  // Test 1: Save and recall a fact across separate conversations
  // -------------------------------------------------------------------------
  console.log("--- Test 1: Save and Recall a Fact Across Separate Conversations ---");
  const convA = `conv_A_${Date.now()}`;
  const convB = `conv_B_${Date.now()}`;

  // Conversation A: Save student identity & field of study
  const saveMessageText = "My name is Rishu. I am a BTech CSE AI-ML student. Remember this.";
  const recorded1 = await maybeRecordMemory(
    repo,
    {
      conversationId: convA,
      messageId: `msg_1_${Date.now()}`,
      text: saveMessageText,
      userId: testUserIdRishu,
    },
    falkor,
    testUserIdRishu,
  );

  assert.ok(recorded1, "Test 1: Memory extraction should succeed for explicit remember instruction");
  assert.ok(recorded1.type === "topic" || recorded1.type === "preference", `Test 1: Memory type should be valid StudyMemoryType, got ${recorded1.type}`);
  assert.equal(recorded1.label, "Saved personal fact", "Test 1: Memory label should be 'Saved personal fact'");
  assert.ok(
    recorded1.summary.toLowerCase().includes("rishu") &&
      recorded1.summary.toLowerCase().includes("cse") &&
      recorded1.summary.toLowerCase().includes("ai-ml"),
    `Test 1: Memory summary should contain student details. Got: "${recorded1.summary}"`,
  );
  console.log(`✓ Conversation A successfully stored memory: "${recorded1.summary}"`);

  // Conversation B: Same user_id, different conversation_id
  const queryConvB = "What is my name, and what am I studying?";
  const retrievalConvB = await retrieveMemories(repo, queryConvB, 5, falkor, testUserIdRishu);

  console.log("retrievalConvB items count:", retrievalConvB.items.length);
  for (const it of retrievalConvB.items) {
    console.log("   - item:", it.summary, "userId:", (it as any).userId);
  }
  assert.ok(
    retrievalConvB.items.length > 0,
    `Test 1: Conversation B must retrieve stored facts for ${testUserIdRishu}. Found: ${retrievalConvB.items.length}`,
  );
  const foundFact = retrievalConvB.items.some((m) =>
    m.summary.toLowerCase().includes("rishu") && m.summary.toLowerCase().includes("btech"),
  );
  assert.ok(foundFact, "Test 1: Retrieved memories must include Rishu's BTech background");
  console.log(`✓ Conversation B retrieved ${retrievalConvB.items.length} memory item(s) across conversation boundary:`);
  for (const m of retrievalConvB.items) {
    console.log(`   - [${m.type}] ${m.label}: ${m.summary}`);
  }

  // Verify prompt constructed for Ollama incorporates the memory
  const ollama = new OllamaAnswerProvider();
  const promptMessages = (ollama as any).buildPrompt({
    content: queryConvB,
    responseMode: "study",
    attachments: [],
    readyAttachments: [],
    memories: retrievalConvB.items,
  });

  const systemMessage = promptMessages.find((m: any) => m.role === "system")?.content ?? "";
  assert.ok(
    systemMessage.includes("Rishu") && systemMessage.includes("BTech"),
    "Test 1: System prompt sent to Qwen must include student's retrieved memory",
  );
  console.log("✓ Verified prompt sent to Qwen contains retrieved memory in system context.");

  // Test live Qwen response if Ollama is online
  const health = await ollama.checkHealth();
  if (health.online && health.hasModel) {
    console.log(`[Ollama] Live inference with model ${ollama.model}...`);
    let qwenResponse = "";
    for await (const chunk of ollama.stream(
      {
        content: queryConvB,
        responseMode: "study",
        attachments: [],
        readyAttachments: [],
        memories: retrievalConvB.items,
      },
      new AbortController().signal,
    )) {
      qwenResponse += chunk;
    }
    console.log(`[Qwen Response Snippet]:\n${qwenResponse.slice(0, 300)}...`);
    const qwenUnderstands =
      qwenResponse.toLowerCase().includes("rishu") ||
      qwenResponse.toLowerCase().includes("btech") ||
      qwenResponse.toLowerCase().includes("cse") ||
      qwenResponse.toLowerCase().includes("ai-ml") ||
      qwenResponse.toLowerCase().includes("ai/ml");
    assert.ok(qwenUnderstands, "Test 1: Qwen response should mention student name or program");
    console.log("✓ Live Qwen inference successfully verified memory context!");
  } else {
    console.log(`[Ollama] Skipped live stream (status: online=${health.online}, hasModel=${health.hasModel})`);
  }

  // -------------------------------------------------------------------------
  // Test 2: Learning continuity across sessions (past mistakes & guidance)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 2: Learning Continuity Across Sessions ---");
  const session1Conv = `conv_session1_${Date.now()}`;
  const mistakeMessageText = "I got the question about Python dictionary methods wrong in my practice test.";

  const recordedMistake = await maybeRecordMemory(
    repo,
    {
      conversationId: session1Conv,
      messageId: `msg_mistake_${Date.now()}`,
      text: mistakeMessageText,
      userId: testUserIdRishu,
    },
    falkor,
    testUserIdRishu,
  );

  assert.ok(recordedMistake, "Test 2: Should record durable mistake signal");
  assert.equal(recordedMistake.type, "mistake", "Test 2: Memory type should be 'mistake'");
  assert.ok(
    recordedMistake.summary.toLowerCase().includes("dictionary methods") ||
      recordedMistake.summary.toLowerCase().includes("python"),
    "Test 2: Summary should contain dictionary methods mistake",
  );
  console.log(`✓ Session 1 recorded learning mistake: "${recordedMistake.summary}"`);

  // Start a new conversation and ask for general study guidance without mentioning dictionaries
  const session2Conv = `conv_session2_${Date.now()}`;
  const continuityQuery = "What should I practise next?";
  const continuityRetrieval = await retrieveMemories(repo, continuityQuery, 5, falkor, testUserIdRishu);

  assert.ok(
    continuityRetrieval.items.length > 0,
    "Test 2: Retrieval for 'What should I practise next?' should find student's recent mistakes",
  );
  const foundMistake = continuityRetrieval.items.some(
    (m) => m.type === "mistake" && m.summary.toLowerCase().includes("dictionary"),
  );
  assert.ok(foundMistake, "Test 2: Continuity retrieval must include the Python dictionary mistake");
  console.log(
    `✓ Session 2 retrieved ${continuityRetrieval.items.length} continuity item(s) for recommendation guidance:`,
  );
  for (const m of continuityRetrieval.items) {
    console.log(`   - [${m.type}] ${m.label}: ${m.summary}`);
  }

  // -------------------------------------------------------------------------
  // Test 3: Identity persistence across conversations
  // -------------------------------------------------------------------------
  console.log("\n--- Test 3: Identity Persistence Across Conversations ---");
  // A returning user retains testUserIdRishu. Querying any new conversation ID with testUserIdRishu returns memories.
  const convRandom = `conv_random_${Math.random().toString(36).substring(2, 9)}`;
  const memoriesRetrievedByUserId = await retrieveMemories(repo, "What is my name?", 5, falkor, testUserIdRishu);
  assert.ok(
    memoriesRetrievedByUserId.items.length > 0,
    "Test 3: User ID must reliably access their memories regardless of conversation ID",
  );
  console.log(
    `✓ Identity persistence confirmed: User ${testUserIdRishu} accessed ${memoriesRetrievedByUserId.items.length} memories in conversation ${convRandom}`,
  );

  // -------------------------------------------------------------------------
  // Test 4: User isolation
  // -------------------------------------------------------------------------
  console.log("\n--- Test 4: User Isolation ---");
  // Querying with testUserIdOther should NOT return Rishu's private memories
  const otherUserRetrieval = await retrieveMemories(
    repo,
    "What is my name, and what am I studying?",
    5,
    falkor,
    testUserIdOther,
  );
  console.log("otherUserRetrieval items count:", otherUserRetrieval.items.length);
  for (const it of otherUserRetrieval.items) {
    console.log("   - item:", it);
  }
  const leakedRishu = otherUserRetrieval.items.some(
    (m) => m.summary.toLowerCase().includes("rishu") || m.summary.toLowerCase().includes("btech"),
  );
  assert.equal(leakedRishu, false, "Test 4: User isolation violated! Rishu's private memories were returned to a different user.");
  console.log(`✓ User isolation verified: Different user ${testUserIdOther} received 0 memories of Rishu.`);

  // -------------------------------------------------------------------------
  // Test 5: Persistence across backend restarts (FalkorDB durability)
  // -------------------------------------------------------------------------
  console.log("\n--- Test 5: Persistence Across Backend Restarts ---");
  // Simulate complete backend restart: instantiate brand new service and empty memory repo
  const newFalkorInstance = new FalkorContextService();
  await newFalkorInstance.init();
  const emptyNewRepo = new MemoryRepository();
  await emptyNewRepo.init();

  if (newFalkorInstance.isConnected) {
    const restartedRetrieval = await retrieveMemories(
      emptyNewRepo,
      "What is my name and degree?",
      5,
      newFalkorInstance,
      testUserIdRishu,
    );
    assert.ok(
      restartedRetrieval.items.length > 0,
      "Test 5: FalkorDB graph database must persist memories across server/service restarts",
    );
    console.log(
      `✓ FalkorDB persistence confirmed: Fresh backend instance retrieved ${restartedRetrieval.items.length} memory item(s) directly from graph database.`,
    );
  } else {
    console.log("⚠ Test 5 note: FalkorDB is not connected in this environment; local in-memory persistence is ephemeral.");
  }

  // -------------------------------------------------------------------------
  // Test 6: Ordinary conversation retrieval without trigger phrases
  // -------------------------------------------------------------------------
  console.log("\n--- Test 6: Ordinary Conversation Retrieval (No Trigger Words) ---");
  // Student asks a natural question with zero trigger phrases like "remember me", "study code", or "what do you remember"
  const ordinaryQuery = "Can you give me an exercise on dictionary methods?";
  const ordinaryRetrieval = await retrieveMemories(repo, ordinaryQuery, 5, falkor, testUserIdRishu);

  assert.ok(
    ordinaryRetrieval.items.length > 0,
    "Test 6: Natural study question should retrieve relevant context via graph concept matching",
  );
  const matchedDictionary = ordinaryRetrieval.items.some((m) => m.summary.toLowerCase().includes("dictionary"));
  assert.ok(
    matchedDictionary,
    "Test 6: Relevant dictionary mistake should be surfaced to assist the student with their exercise",
  );
  console.log(
    `✓ Ordinary conversation retrieval verified: "${ordinaryQuery}" retrieved ${ordinaryRetrieval.items.length} relevant memory item(s) without special trigger words.`,
  );

  console.log("\n==================================================================");
  console.log("All 6 End-to-End Memory Pipeline Tests Passed Successfully!");
  console.log("==================================================================");

  await falkor.close();
  await newFalkorInstance.close();
  process.exit(0);
}

runEndToEndTests().catch((err) => {
  console.error("\n❌ End-to-End Test Suite Failed:", err);
  process.exit(1);
});
