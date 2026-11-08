import ReactDOM from "react-dom/client";
import App from "./App";
import { liveTwinSource } from "./data/liveSource";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App source={liveTwinSource} />
);
