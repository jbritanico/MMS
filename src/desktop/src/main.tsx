import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { prepareBasemap } from "./lib/basemap";

// Find the offline map file first (a quick local lookup), then start the app.
prepareBasemap().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
