import { redirect } from "next/navigation";

import { getDefaultTenantSlug } from "@/src/wiki/tenant-routing";

export default function Home() {
  redirect(`/${getDefaultTenantSlug()}`);
}
