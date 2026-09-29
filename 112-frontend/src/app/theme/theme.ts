import { createTheme } from "@mui/material/styles";

import { components } from "./components";

export const theme = createTheme({
  components,
  palette: {
    primary: {
      main: "#008bc5",
      dark: "#115a7a",
      light: "#63a7c5",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#4b5961",
    },
    background: {
      default: "#c8cfd3",
      paper: "#ffffff",
    },
    text: {
      primary: "#27343b",
      secondary: "#607079",
    },
  },
  shape: {
    borderRadius: 0,
  },
  typography: {
    fontFamily: 'Arial, "Helvetica Neue", sans-serif',
    fontSize: 13,
    h4: {
      fontSize: "1.35rem",
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h6: {
      fontSize: "0.88rem",
      fontWeight: 600,
      lineHeight: 1.2,
    },
  },
});
