import { redirect } from "next/navigation";
import { TRACCAR_URL, getToken } from "@/lib/traccar";
import Shell from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = await getToken();
  if (!token) redirect("/login");
  let name = "";
  try {
    const r = await fetch(`${TRACCAR_URL}/api/session?token=${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json" }, cache: "no-store",
    });
    if (r.status === 401 || r.status === 404) redirect("/login");
    if (r.ok) name = (await r.json()).email;
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
  }
  return <Shell user={name}>{children}</Shell>;
}
