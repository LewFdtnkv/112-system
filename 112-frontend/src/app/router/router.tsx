import { createBrowserRouter } from "react-router-dom";

import { routes } from "./routes";
import { installAssetRecovery } from "../model/assetRecovery";

installAssetRecovery();
export const router = createBrowserRouter(routes);
