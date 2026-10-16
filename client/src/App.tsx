import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/erp" component={Home} />
      <Route path="/producao" component={Home} />
      <Route path="/qualidade" component={Home} />
      <Route path="/estoque" component={Home} />
      <Route path="/manutencao" component={Home} />
      <Route path="/rh" component={Home} />
      <Route path="/ordens" component={Home} />
      <Route path="/financeiro" component={Home} />
      <Route path="/usuarios" component={Home} />
      <Route path="/meu-perfil" component={Home} />
      <Route path="/configuracoes" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
