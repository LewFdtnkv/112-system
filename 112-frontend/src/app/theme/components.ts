import type { Components, Theme } from "@mui/material/styles";

export const components: Components<Theme> = {
  MuiButton: {
    defaultProps: {
      size: "small",
      disableElevation: true,
    },
    styleOverrides: {
      root: {
        borderRadius: 0,
        border: "1px solid transparent",
        fontWeight: 600,
        letterSpacing: 0,
        minHeight: 30,
        textTransform: "none",
        fontSize: "0.75rem",
      },
    },
    variants: [
      {
        props: { variant: "contained", color: "primary" },
        style: {
          backgroundColor: "#008bc5",
          "&:hover": { backgroundColor: "#115a7a" },
        },
      },
      {
        props: { variant: "outlined" },
        style: {
          borderColor: "#8b9aa1",
          "&:hover": {
            borderColor: "#008bc5",
            backgroundColor: "#e7f2f7",
          },
        },
      },
    ],
  },
  MuiTextField: {
    defaultProps: {
      size: "small",
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        backgroundColor: "#ffffff",
        borderRadius: 0,
      },
    },
  },
  MuiTableContainer: {
    styleOverrides: {
      root: {
        border: "1px solid #aeb9be",
        backgroundColor: "#ffffff",
        borderRadius: 0,
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: {
        borderColor: "#d2d9dc",
        padding: "7px 10px",
        fontSize: "0.78rem",
      },
      head: {
        backgroundColor: "#45545c",
        color: "#ffffff",
        fontWeight: 600,
        whiteSpace: "nowrap",
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        "&:nth-of-type(even)": {
          backgroundColor: "#f4f7f8",
        },
        "&:hover": {
          backgroundColor: "#e2f1f7",
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 0,
        border: "1px solid #778890",
      },
    },
  },
  MuiDialogTitle: {
    styleOverrides: {
      root: {
        backgroundColor: "#26343b",
        borderBottom: "3px solid #167aa5",
        color: "#ffffff",
        fontSize: "0.9rem",
      },
    },
  },
  MuiDialogActions: {
    styleOverrides: {
      root: {
        backgroundColor: "#eef2f3",
        borderTop: "1px solid #c4cdd1",
      },
    },
  },
  MuiAlert: {
    styleOverrides: {
      root: {
        borderRadius: 0,
      },
    },
  },
};
