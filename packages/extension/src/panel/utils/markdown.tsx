import type { ComponentChildren } from "preact";

/** Render inline markdown: [links](url) and **bold** */
export function renderMarkdownLinks(text: string): ComponentChildren {
  const inlineRegex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;
  const segments = text.split(inlineRegex);

  const parts: ComponentChildren[] = segments.map((seg, i) => {
    const linkMatch = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" class="faq-link">
          {linkMatch[1]}
        </a>
      );
    }
    const boldMatch = seg.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return <strong key={i}>{boldMatch[1]}</strong>;
    }
    return seg;
  });

  return parts;
}

/** Highlight search matches and render inline markdown (links + bold) */
export function renderWithHighlights(text: string, query: string): ComponentChildren {
  if (!query.trim()) return renderMarkdownLinks(text);

  const inlineRegex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;
  const segments = text.split(inlineRegex);
  const queryRegex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");

  return segments.map((segment, segIndex) => {
    const linkMatch = segment.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const linkParts = linkMatch[1].split(queryRegex);
      return (
        <a
          key={segIndex}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          class="faq-link"
        >
          {linkParts.map((part, i) =>
            queryRegex.test(part) ? <mark key={i}>{part}</mark> : part
          )}
        </a>
      );
    }
    const boldMatch = segment.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      const boldParts = boldMatch[1].split(queryRegex);
      return (
        <strong key={segIndex}>
          {boldParts.map((part, i) =>
            queryRegex.test(part) ? <mark key={i}>{part}</mark> : part
          )}
        </strong>
      );
    }
    const parts = segment.split(queryRegex);
    return parts.map((part, i) =>
      queryRegex.test(part) ? <mark key={`${segIndex}-${i}`}>{part}</mark> : part
    );
  });
}
