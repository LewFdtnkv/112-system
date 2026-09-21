import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";

import "@/app/styles/global.scss";

document.addEventListener("copy", (event) => {
  event.preventDefault();
});

document.addEventListener("selectstart", (event) => {
  event.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
