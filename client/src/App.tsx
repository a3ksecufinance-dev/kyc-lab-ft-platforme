import { Switch, Route, Redirect } from "wouter";
import type { ReactElement } from "react";
import { useAuth } from "./hooks/useAuth";
import { hasRole } from "./lib/auth";
import { LoginPage }          from "./pages/LoginPage";
import { DashboardPage }      from "./pages/DashboardPage";
import { CustomersPage }      from "./pages/CustomersPage";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { TransactionsPage }   from "./pages/TransactionsPage";
import { AlertsPage }         from "./pages/AlertsPage";
import { CasesPage }          from "./pages/CasesPage";
import { CaseDetailPage }     from "./pages/CaseDetailPage";
import { ScreeningPage }      from "./pages/ScreeningPage";
import { ReportsPage }        from "./pages/ReportsPage";
import { AmlRulesPage }       from "./pages/AmlRulesPage";
import { AdminPage }          from "./pages/AdminPage";
import { Amld6Page }          from "./pages/Amld6Page";
import { MfaSettingsPage }    from "./pages/MfaSettingsPage";
import { DocumentsPage }      from "./pages/DocumentsPage";
import { NetworkPage }        from "./pages/NetworkPage";
import { PkycPage }           from "./pages/PkycPage";
import { ResetPasswordPage }  from "./pages/ResetPasswordPage";
import { WalletsPage }           from "./pages/WalletsPage";
import { WalletCompliancePage }  from "./pages/WalletCompliancePage";
import { AgentsPage }         from "./pages/AgentsPage";
import { BamReportsPage }     from "./pages/BamReportsPage";
import { CbsSimulatorPage }   from "./pages/CbsSimulatorPage";
import { SlaMonitoringPage }  from "./pages/SlaMonitoringPage";
import { TravelRulePage }     from "./pages/TravelRulePage";
import { AuditPage }          from "./pages/AuditPage";
import { CorrespondentPage }  from "./pages/CorrespondentPage";
import { ApprovalsPage }     from "./pages/ApprovalsPage";
import { LicensePage }       from "./pages/LicensePage";

function PrivateRoute({ component: Component, minRole }: {
  component: () => ReactElement;
  minRole?: "analyst" | "supervisor" | "compliance_officer" | "admin";
}) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" />;
  if (minRole && !hasRole(user, minRole)) return <Redirect to="/" />;
  return <Component />;
}

export function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/" /> : <LoginPage />}
      </Route>
      <Route path="/reset-password">
        {isAuthenticated ? <Redirect to="/" /> : <ResetPasswordPage />}
      </Route>

      <Route path="/"             component={() => <PrivateRoute component={DashboardPage} />} />
      <Route path="/customers"    component={() => <PrivateRoute component={CustomersPage} />} />
      <Route path="/customers/:id" component={() => <PrivateRoute component={CustomerDetailPage} />} />
      <Route path="/transactions" component={() => <PrivateRoute component={TransactionsPage} />} />
      <Route path="/alerts"       component={() => <PrivateRoute component={AlertsPage} />} />
      <Route path="/cases"        component={() => <PrivateRoute component={CasesPage} />} />
      <Route path="/cases/:id"    component={() => <PrivateRoute component={CaseDetailPage} />} />
      <Route path="/screening"    component={() => <PrivateRoute component={ScreeningPage} />} />
      <Route path="/reports"      component={() => <PrivateRoute component={ReportsPage} />} />
      <Route path="/aml-rules"     component={() => <PrivateRoute component={AmlRulesPage} minRole="analyst" />} />
      <Route path="/amld6"         component={() => <PrivateRoute component={Amld6Page} minRole="compliance_officer" />} />
      <Route path="/documents"     component={() => <PrivateRoute component={DocumentsPage} />} />
      <Route path="/network"       component={() => <PrivateRoute component={NetworkPage} minRole="analyst" />} />
      <Route path="/pkyc"          component={() => <PrivateRoute component={PkycPage} minRole="analyst" />} />
      <Route path="/mfa"           component={() => <PrivateRoute component={MfaSettingsPage} />} />
      <Route path="/admin"        component={() => <PrivateRoute component={AdminPage} minRole="admin" />} />
      <Route path="/wallets"             component={() => <PrivateRoute component={WalletsPage}          minRole="analyst" />} />
      <Route path="/wallet-compliance"  component={() => <PrivateRoute component={WalletCompliancePage} minRole="analyst" />} />
      <Route path="/agents"       component={() => <PrivateRoute component={AgentsPage}  minRole="analyst" />} />
      <Route path="/bam"          component={() => <PrivateRoute component={BamReportsPage} minRole="compliance_officer" />} />
      <Route path="/sla"          component={() => <PrivateRoute component={SlaMonitoringPage} minRole="analyst" />} />
      <Route path="/travel-rule"  component={() => <PrivateRoute component={TravelRulePage} minRole="compliance_officer" />} />
      <Route path="/audit"         component={() => <PrivateRoute component={AuditPage} minRole="supervisor" />} />
      <Route path="/correspondent" component={() => <PrivateRoute component={CorrespondentPage} minRole="analyst" />} />
      <Route path="/approvals"    component={() => <PrivateRoute component={ApprovalsPage} minRole="compliance_officer" />} />
      <Route path="/license"     component={() => <PrivateRoute component={LicensePage} minRole="admin" />} />

      {/* Route publique — simulateur CBS (pas d'auth requise) */}
      <Route path="/cbs" component={CbsSimulatorPage} />

      <Route>{isAuthenticated ? <Redirect to="/" /> : <Redirect to="/login" />}</Route>
    </Switch>
  );
}
