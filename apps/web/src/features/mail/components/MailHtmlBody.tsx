import * as React from "react";
import { ImageOff } from "lucide-react";

/**
 * Renders an email's own HTML.
 *
 * Email HTML is arbitrary markup written by whoever sent the message, so it is
 * never injected into this document — `dangerouslySetInnerHTML` on a stranger's
 * markup is the classic mail-client XSS. It goes into a sandboxed iframe with
 * no `allow-scripts`, so scripts simply do not execute, and a CSP inside the
 * frame as a second layer.
 *
 * `allow-same-origin` is present *without* `allow-scripts`, which is what lets
 * the parent measure the content height. That pairing is deliberate: together
 * the two would defeat the sandbox, but with scripting off there is nothing
 * running inside the frame to take advantage of it.
 *
 * Remote images are blocked until asked for. A newsletter's images are mostly
 * tracking pixels, and loading them silently tells the sender the mail was
 * opened, from this IP, at this time.
 */
export function MailHtmlBody({ html }: { html: string }) {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState(320);
  const [showImages, setShowImages] = React.useState(true);

  const hasRemoteImages = React.useMemo(
    () => /<img[^>]+src\s*=\s*["']?https?:/i.test(html),
    [html],
  );

  const document = React.useMemo(() => {
    // Without 'unsafe-inline' for styles nearly every marketing email loses its
    // layout — inline style attributes are how email design works. Scripts stay
    // denied outright, and the sandbox already blocks them regardless.
    const imgSrc = showImages ? "https: data: cid:" : "data:";
    const csp = [
      "default-src 'none'",
      `img-src ${imgSrc}`,
      "style-src 'unsafe-inline'",
      "font-src data:",
      "form-action 'none'",
    ].join("; ");

    return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html,body { margin:0; padding:0; }
  body {
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #1f1f1f;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100% !important; }
  a { color: #0b57d0; }
  @media (prefers-color-scheme: dark) {
    body { color: #e8e8e8; background: transparent; }
    a { color: #8ab4f8; }
  }
</style>
</head><body>${html}</body></html>`;
  }, [html, showImages]);

  // Re-measure whenever the document changes: toggling images reflows it.
  const measure = React.useCallback(() => {
    const body = frameRef.current?.contentDocument?.body;
    if (body) setHeight(Math.min(body.scrollHeight + 16, 20000));
  }, []);

  React.useEffect(() => {
    // Images and webfonts land after load, each changing the height.
    const timers = [80, 400, 1200].map((delay) =>
      window.setTimeout(measure, delay),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [document, measure]);

  return (
    <div className="flex flex-col gap-2">
      {hasRemoteImages && !showImages && (
        <div className="flex items-center gap-2 rounded-lg border border-mail-line bg-mail-chip px-3 py-2 text-[13px] text-mail-muted">
          <ImageOff className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Images are blocked to stop senders tracking when you opened this.
          </span>
          <button
            type="button"
            onClick={() => setShowImages(true)}
            className="shrink-0 font-medium text-mail-strong hover:underline"
          >
            Display images
          </button>
        </div>
      )}

      <iframe
        ref={frameRef}
        title="Message content"
        srcDoc={document}
        onLoad={measure}
        // No allow-scripts: nothing in here executes. allow-popups so a link
        // can still open, in a tab this frame has no handle on.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="w-full border-0 bg-transparent"
        style={{ height }}
      />
    </div>
  );
}
