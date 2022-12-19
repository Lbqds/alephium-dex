import { CssBaseline } from "@material-ui/core";
import { ThemeProvider } from "@material-ui/core/styles";
import { SnackbarProvider } from "notistack";
import ReactDOM from "react-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AlephiumWalletProvider } from "./contexts/AlephiumWalletContext";
import { theme } from "./muiTheme";
ReactDOM.render(
  <ErrorBoundary>
    <ThemeProvider theme={theme}>
      <CssBaseline />
        <AlephiumWalletProvider>
          <SnackbarProvider maxSnack={3}>
            <App />
          </SnackbarProvider>
        </AlephiumWalletProvider>
    </ThemeProvider>
  </ErrorBoundary>,
  document.getElementById("root")
);
