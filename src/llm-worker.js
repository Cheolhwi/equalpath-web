// Runs the WebLLM model off the main thread (Ask for me, 13 Oct 2026).
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message) => handler.onmessage(message);
