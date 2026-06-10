import { requireUser } from "@/lib/guards";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    if (!url) return new Response("url param required", { status: 400 });

    // SSRF protection: only proxy Vercel Blob URLs
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response("invalid url", { status: 400 });
    }
    if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) {
      return new Response("forbidden", { status: 403 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return new Response("storage not configured", { status: 501 });

    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!upstream.ok) return new Response("blob not found", { status: upstream.status });

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return new Response("proxy error", { status: 500 });
  }
}
