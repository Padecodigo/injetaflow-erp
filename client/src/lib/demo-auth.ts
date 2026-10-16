export type DemoRole = "admin" | "collaborator";

export type DemoSession = {
  name: string;
  record: string;
  role: DemoRole;
};

const DEMO_USERS: Record<string, { password: string; session: DemoSession }> = {
  "admin@wamovale.com.br": {
    password: "adm123",
    session: { name: "Administrador Wamovale", record: "ADM-00001", role: "admin" },
  },
  "ana.paula@wamovale.com.br": {
    password: "demo123",
    session: { name: "Ana Paula Souza", record: "REG-00027", role: "collaborator" },
  },
  "mariana.costa@wamovale.com.br": {
    password: "demo123",
    session: { name: "Mariana Costa", record: "REG-00041", role: "collaborator" },
  },
};

export function authenticateDemoUser(email: string, password: string): DemoSession | null {
  const normalizedEmail = email.trim().toLowerCase();
  const account = DEMO_USERS[normalizedEmail];
  if (!account || account.password !== password) return null;
  return account.session;
}

export function isDemoAdmin(email: string): boolean {
  return email.trim().toLowerCase() === "admin@wamovale.com.br";
}
