export function MarkdownArticle({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);

  if (blocks.length === 0) {
    return (
      <p className="text-base leading-8 text-muted-foreground">
        This page does not have published body content yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Heading = block.level <= 2 ? "h2" : "h3";

          return (
            <Heading
              key={`${block.type}-${index}`}
              className="text-2xl font-semibold leading-8 text-foreground"
            >
              {block.text}
            </Heading>
          );
        }

        if (block.type === "list") {
          return (
            <ul
              key={`${block.type}-${index}`}
              className="list-disc space-y-2 pl-5 text-base leading-8 text-foreground"
            >
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={`${block.type}-${index}`}
            className="text-base leading-8 text-foreground"
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

type MarkdownBlock =
  | {
      type: "heading";
      level: 1 | 2 | 3;
      text: string;
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "list";
      items: string[];
    };

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph: string[] = [];
  let listItems: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraph.join(" "),
      });
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({
        type: "list",
        items: listItems,
      });
      listItems = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: 3,
        text: line.slice(4).trim(),
      });
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: 2,
        text: line.slice(3).trim(),
      });
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: 1,
        text: line.slice(2).trim(),
      });
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2).trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}
