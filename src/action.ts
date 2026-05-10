// SPDX short identifier: MIT

import * as getter from "./get-hylo";

// Main entry point of the task.
getter.main().catch((error) => {
  console.error("Error in main:", error);
  process.exit(1);
});
