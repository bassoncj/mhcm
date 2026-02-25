import { useState, useMemo } from "preact/hooks";
import { faqData, type FAQCategory, type FAQGroup, type FAQItem } from "../../data/faq.js";
import { IconSearch, IconChevronRight, IconChevronDown, IconArrowLeft } from "./Icons.js";
import { renderMarkdownLinks, renderWithHighlights } from "../../utils/markdown.js";
import type { ComponentChildren } from "preact";

type ViewState =
  | { type: "overview" }
  | { type: "category"; slug: string }
  | { type: "group"; categorySlug: string; groupSlug: string }
  | { type: "search"; query: string };

function FAQItemCard({ item, defaultExpanded = false }: { item: FAQItem; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div class={`faq-item-card${expanded ? " expanded" : ""}`}>
      <button class="faq-item-header" onClick={() => setExpanded(!expanded)}>
        <span class="faq-item-question">{item.question}</span>
        <span class="faq-item-chevron">
          {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        </span>
      </button>
      {expanded && <p class="faq-item-answer">{renderMarkdownLinks(item.answer)}</p>}
    </div>
  );
}

function CategoryCard({
  category,
  onClick,
}: {
  category: FAQCategory;
  onClick: () => void;
}) {
  const count = category.groups
    ? category.groups.reduce((s, g) => s + g.items.length, 0)
    : (category.items?.length ?? 0);

  return (
    <button class="faq-section-card" onClick={onClick}>
      <div class="faq-section-card-content">
        <span class="faq-section-card-title">{category.title}</span>
        {category.description && (
          <span class="faq-section-card-desc">{category.description}</span>
        )}
        <span class="faq-section-card-count">
          {count} question{count !== 1 ? "s" : ""}
        </span>
      </div>
      <IconChevronRight size={16} class="faq-section-card-arrow" />
    </button>
  );
}

function GroupCard({
  group,
  onClick,
}: {
  group: FAQGroup;
  onClick: () => void;
}) {
  return (
    <button class="faq-section-card" onClick={onClick}>
      <div class="faq-section-card-content">
        <span class="faq-section-card-title">{group.title}</span>
        {group.description && (
          <span class="faq-section-card-desc">{group.description}</span>
        )}
        <span class="faq-section-card-count">
          {group.items.length} question{group.items.length !== 1 ? "s" : ""}
        </span>
      </div>
      <IconChevronRight size={16} class="faq-section-card-arrow" />
    </button>
  );
}

function SearchBar({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div class="faq-search-bar">
      <IconSearch size={14} class="faq-search-icon" />
      <input
        type="text"
        placeholder="Search FAQ..."
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        class="faq-search-input"
      />
      {value && (
        <button class="faq-search-clear" onClick={onClear}>
          &times;
        </button>
      )}
    </div>
  );
}

function FAQSearchResult({
  item,
  breadcrumb,
  query,
}: {
  item: FAQItem;
  breadcrumb: string;
  query: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div class={`faq-search-result${expanded ? " expanded" : ""}`}>
      <button class="faq-search-header" onClick={() => setExpanded(!expanded)}>
        <div class="faq-search-header-content">
          <span class="faq-search-section">{breadcrumb}</span>
          <span class="faq-search-question">{renderWithHighlights(item.question, query)}</span>
        </div>
        <span class="faq-item-chevron">
          {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        </span>
      </button>
      {expanded && <p class="faq-search-answer">{renderWithHighlights(item.answer, query)}</p>}
    </div>
  );
}

export function FAQPage() {
  const [view, setView] = useState<ViewState>({ type: "overview" });
  const [searchQuery, setSearchQuery] = useState("");

  // First category (Getting Started) shown inline; rest as cards
  const gettingStarted = faqData[0];
  const otherCategories = faqData.slice(1);

  // Global search across all categories
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    const results: Array<{ item: FAQItem; breadcrumb: string }> = [];

    for (const cat of faqData) {
      if (cat.items) {
        for (const item of cat.items) {
          if (
            item.question.toLowerCase().includes(query) ||
            item.answer.toLowerCase().includes(query)
          ) {
            results.push({ item, breadcrumb: cat.title });
          }
        }
      }
      if (cat.groups) {
        for (const group of cat.groups) {
          for (const item of group.items) {
            if (
              item.question.toLowerCase().includes(query) ||
              item.answer.toLowerCase().includes(query)
            ) {
              results.push({ item, breadcrumb: `${cat.title} \u203a ${group.title}` });
            }
          }
        }
      }
    }
    return results;
  }, [searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      setView({ type: "search", query });
    } else if (view.type === "search") {
      setView({ type: "overview" });
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setView({ type: "overview" });
  };

  const goToCategory = (slug: string) => {
    setSearchQuery("");
    setView({ type: "category", slug });
  };

  const goToGroup = (categorySlug: string, groupSlug: string) => {
    setSearchQuery("");
    setView({ type: "group", categorySlug, groupSlug });
  };

  const goBack = () => {
    setSearchQuery("");
    if (view.type === "group") {
      setView({ type: "category", slug: view.categorySlug });
    } else {
      setView({ type: "overview" });
    }
  };

  // Resolve current category/group for detail views
  const currentCategory =
    view.type === "category" || view.type === "group"
      ? faqData.find((c) => c.slug === (view.type === "group" ? view.categorySlug : view.slug))
      : null;

  const currentGroup =
    view.type === "group" && currentCategory?.groups
      ? currentCategory.groups.find((g) => g.slug === view.groupSlug)
      : null;

  // Build header content
  let headerContent: ComponentChildren;
  if (view.type === "group" && currentCategory && currentGroup) {
    headerContent = (
      <>
        <button class="faq-back-btn" onClick={goBack}>
          <IconArrowLeft size={16} />
        </button>
        <div class="faq-breadcrumb">
          <span class="faq-breadcrumb-parent">{currentCategory.title}</span>
          <span class="faq-breadcrumb-sep">{"\u203a"}</span>
          <span class="faq-breadcrumb-current">{currentGroup.title}</span>
        </div>
      </>
    );
  } else if (view.type === "category" && currentCategory) {
    headerContent = (
      <>
        <button class="faq-back-btn" onClick={goBack}>
          <IconArrowLeft size={16} />
        </button>
        <h2>{currentCategory.title}</h2>
      </>
    );
  } else {
    headerContent = <h2>Frequently Asked Questions</h2>;
  }

  return (
    <div class="faq-page">
      <div class="faq-header">{headerContent}</div>

      <SearchBar value={searchQuery} onChange={handleSearch} onClear={clearSearch} />

      <div class="faq-content">
        {/* Search results */}
        {view.type === "search" && searchResults && (
          <div class="faq-search-results">
            {searchResults.length === 0 ? (
              <p class="faq-no-results">No results found for "{searchQuery}"</p>
            ) : (
              <>
                <p class="faq-results-count">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                </p>
                {searchResults.map(({ item, breadcrumb }, i) => (
                  <FAQSearchResult key={i} item={item} breadcrumb={breadcrumb} query={searchQuery} />
                ))}
              </>
            )}
          </div>
        )}

        {/* Overview */}
        {view.type === "overview" && (
          <>
            {/* Getting Started inline Q&As */}
            {gettingStarted.items && (
              <div class="faq-intro-section">
                <h3 class="faq-intro-title">{gettingStarted.title}</h3>
                {gettingStarted.items.map((item, i) => (
                  <FAQItemCard key={i} item={item} />
                ))}
              </div>
            )}

            {/* Other categories as cards */}
            <div class="faq-section-cards">
              {otherCategories.map((cat) => (
                <CategoryCard key={cat.slug} category={cat} onClick={() => goToCategory(cat.slug)} />
              ))}
            </div>
          </>
        )}

        {/* Category detail */}
        {view.type === "category" && currentCategory?.groups && (
          <div class="faq-section-detail">
            {currentCategory.groups.map((group, i) => {
              // First group with slug "getting-started" renders inline
              if (i === 0 && group.slug === "getting-started") {
                return (
                  <div key={group.slug} class="faq-intro-section">
                    <h3 class="faq-intro-title">{group.title}</h3>
                    {group.items.map((item, j) => (
                      <FAQItemCard key={j} item={item} />
                    ))}
                  </div>
                );
              }
              return (
                <GroupCard
                  key={group.slug}
                  group={group}
                  onClick={() => goToGroup(currentCategory.slug, group.slug)}
                />
              );
            })}
          </div>
        )}

        {/* Group detail */}
        {view.type === "group" && currentGroup && (
          <div class="faq-section-detail">
            {currentGroup.items.map((item, i) => (
              <FAQItemCard key={i} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
