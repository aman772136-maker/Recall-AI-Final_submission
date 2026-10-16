import "../src/config.js";
import { falkorContext } from "../src/services/falkordb.js";
import { MemoryRepository } from "../src/db/memory-repository.js";
import { retrieveMemories } from "../src/services/memory.js";

async function run() {
  console.log("=== Testing Live FalkorDB Cloud Integration ===");
  await falkorContext.init();
  console.log("FalkorDB connected:", falkorContext.isConnected);
  console.log("Target graph:", falkorContext.graphName);

  if (!falkorContext.isConnected) {
    throw new Error("FalkorDB is not connected!");
  }

  // 1. Multi-hop traversal test
  const query = "How do I calculate friction on an inclined ramp?";
  console.log(`\nQuery: "${query}"`);
  const repo = new MemoryRepository();
  await repo.init();

  const result = await retrieveMemories(repo, query, 4, falkorContext);
  console.log("Retrieved count:", result.items.length);
  console.log("Explanation Note:", result.note);

  for (const item of result.items) {
    console.log(` - [${item.type}] ${item.label}: ${item.summary}`);
  }

  // 2. Linear Algebra traversal test
  const lalgQuery = "How do I find eigenvalues using matrix decomposition?";
  console.log(`\nQuery: "${lalgQuery}"`);
  const lalgResult = await retrieveMemories(repo, lalgQuery, 4, falkorContext);
  console.log("Retrieved count:", lalgResult.items.length);
  console.log("Explanation Note:", lalgResult.note);

  for (const item of lalgResult.items) {
    console.log(` - [${item.type}] ${item.label}: ${item.summary}`);
  }

  await falkorContext.close();
  console.log("\n=== Live FalkorDB Cloud Integration Verified Successfully! ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
