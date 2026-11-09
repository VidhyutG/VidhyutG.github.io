// @ts-check
/**
 * Routes the board off the main thread, so the page stays responsive while
 * the copper is laid. The same generator runs inline if workers are unavailable.
 */
import { generateBoard } from "./generate.js";

addEventListener("message", (event) => {
  postMessage(generateBoard(Number(event.data)));
});
