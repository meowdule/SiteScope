export async function checkDns(hostname: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const enc = encodeURIComponent(hostname);
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${enc}&type=A`,
      {
        headers: { accept: "application/dns-json" },
      },
    );
    if (!res.ok) {
      return { ok: false, message: `DNS lookup failed (${res.status}).` };
    }
    const data = (await res.json()) as {
      Status: number;
      Answer?: { data: string }[];
    };
    if (data.Status !== 0 && !data.Answer?.length) {
      return { ok: false, message: "No DNS records found for this host." };
    }
    return { ok: true, message: "DNS resolves." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, message: `DNS check error: ${msg}` };
  }
}
