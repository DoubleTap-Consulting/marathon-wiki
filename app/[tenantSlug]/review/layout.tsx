import { AuthScope } from "../_components/auth-scope";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthScope>{children}</AuthScope>;
}
