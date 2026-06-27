import React from "react";
import { createRoot } from "react-dom/client";
import "./ds/tokens.css";      // design tokens — cascade base
import "./ds/primitives.css";  // primitive component styles
import App from "./App.jsx";
import "./styles.css";         // app layout — overrides DS where needed

createRoot(document.getElementById("root")).render(<App />);
