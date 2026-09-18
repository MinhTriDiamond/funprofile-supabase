// Force rebuild 2026-03-08
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installThirdPartySilencer } from "./lib/silenceThirdParty";

installThirdPartySilencer();

declare global {
  interface Window {
    __FUN_MAIN_EXECUTED__?: boolean;
  }
}

window.__FUN_MAIN_EXECUTED__ = true;

console.info(`[FUN Profile] Build: ${import.meta.env.VITE_BUILD_ID || "dev"} | ${new Date().toISOString()}`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
