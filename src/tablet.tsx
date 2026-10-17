import ReactDOM from "react-dom/client";
import { TabletApp } from "./components/board/TabletApp";
import { RemotePanel } from "./components/board/RemotePanel";
ReactDOM.createRoot(document.getElementById("root")!).render(
	location.pathname === "/remote" ? <RemotePanel /> : <TabletApp />,
);
