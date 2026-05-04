import type { Metadata } from "next";

import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Connexion",
};

export default function LoginPage() {
  return <LoginClient />;
}
