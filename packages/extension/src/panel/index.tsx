import { render } from "preact";
import { App } from "./app.js";
import { restoreTheme } from "./signals/theme.js";
import "./styles/main.css";

// Restore saved theme before first render
restoreTheme();

const root = document.getElementById("app");
if (root) {
  render(<App />, root);
}
