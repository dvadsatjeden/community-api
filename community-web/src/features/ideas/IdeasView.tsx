import React, { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import type { DerivedAccount } from "../account/seedRecovery";
import type { IdeaCategory, IdeaCategoryId, IdeaItem } from "./ideasApi";
import { createIdea, fetchCategories, fetchIdeas } from "./ideasApi";
import { IdeaDetailPanel } from "./IdeaDetailPanel";
import { CreateIdeaForm } from "./CreateIdeaForm";
import { getOrCreateUpvoteToken } from "./upvoteToken";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("sk-SK", { day: "numeric", month: "short", year: "numeric" });

type Props = {
  apiBase: string;
  account: DerivedAccount | null;
};

export const IdeasView = ({ apiBase, account }: Props): ReactElement => {
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [categories, setCategories] = useState<IdeaCategory[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSort, setFilterSort] = useState<"newest" | "upvotes">("newest");
  const [searchQ, setSearchQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailIdea, setDetailIdea] = useState<IdeaItem | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const voterToken = useMemo(() => {
    if (account) return account.rsvpToken;
    return getOrCreateUpvoteToken();
  }, [account]);

  const loadIdeas = useCallback(async (): Promise<void> => {
    if (!apiBase) return;
    setLoading(true);
    try {
      const params = {
        category: filterCategory !== "all" ? filterCategory : undefined,
        q: searchQ.trim() || undefined,
        sort: filterSort,
      };
      const items = await fetchIdeas(apiBase, params);
      setIdeas(items);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [apiBase, filterCategory, filterSort, searchQ]);

  useEffect(() => {
    if (!apiBase) return;
    void fetchCategories(apiBase).then(setCategories).catch(() => null);
  }, [apiBase]);

  useEffect(() => {
    void loadIdeas();
  }, [loadIdeas]);

  const handleCreate = async (payload: {
    title: string;
    description: string;
    categoryId: IdeaCategoryId;
    categoryOther?: string;
    authorPseudonym?: string;
  }): Promise<void> => {
    if (!account || !apiBase) throw new Error("Potrebuješ účet");
    await createIdea(apiBase, account.rsvpToken, payload);
    setShowCreateForm(false);
    void loadIdeas();
  };

  return (
    <div className="dvcIdeasView">
      <div className="dvcViewHeader">
        <h2 className="dvcViewTitle">Nápady &amp; projekty</h2>
        {account ? (
          <button
            type="button"
            className="dvcBtn dvcBtnPrimary"
            style={{ fontSize: "0.85rem", padding: "8px 14px", minHeight: "unset" }}
            onClick={() => setShowCreateForm((v) => !v)}
          >
            {showCreateForm ? "Zrušiť" : "+ Pridať nápad"}
          </button>
        ) : null}
      </div>

      {showCreateForm && account ? (
        <div className="dvcCard" style={{ marginBottom: "16px" }}>
          <CreateIdeaForm
            categories={categories}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      ) : null}

      {!account ? (
        <div className="dvcEmpty" style={{ marginBottom: "16px" }}>
          Pre pridanie nápadu potrebuješ <strong>účet</strong> — vytvor si ho v nastaveniach.
        </div>
      ) : null}

      {/* Filters */}
      <div className="dvcIdeasFilters">
        <input
          className="dvcInput dvcIdeasSearch"
          type="search"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Hľadať…"
        />
        <div className="dvcIdeasCategoryChips">
          <button
            type="button"
            className={filterCategory === "all" ? "dvcFilterChip dvcFilterChip--active" : "dvcFilterChip"}
            onClick={() => setFilterCategory("all")}
          >
            Všetky
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={filterCategory === c.id ? "dvcFilterChip dvcFilterChip--active" : "dvcFilterChip"}
              onClick={() => setFilterCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="dvcIdeasSortChips">
          <button
            type="button"
            className={filterSort === "newest" ? "dvcFilterChip dvcFilterChip--active" : "dvcFilterChip"}
            onClick={() => setFilterSort("newest")}
          >
            Najnovšie
          </button>
          <button
            type="button"
            className={filterSort === "upvotes" ? "dvcFilterChip dvcFilterChip--active" : "dvcFilterChip"}
            onClick={() => setFilterSort("upvotes")}
          >
            Najviac hlasov
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="dvcEmpty">Načítavam…</div>
      ) : ideas.length === 0 ? (
        <div className="dvcEmpty">Žiadne nápady. Buď prvý!</div>
      ) : (
        <div className="dvcIdeaList">
          {ideas.map((idea) => (
            <button
              key={idea.id}
              type="button"
              className="dvcIdeaCard"
              onClick={() => setDetailIdea(idea)}
            >
              <div className="dvcIdeaCardTop">
                <span className="dvcIdeaCategoryBadge">{idea.categoryOther ?? idea.categoryId}</span>
                <span className="dvcIdeaCardDate">{formatDate(idea.createdAt)}</span>
              </div>
              <h3 className="dvcIdeaCardTitle">{idea.title}</h3>
              <p className="dvcIdeaCardDesc">{idea.description.slice(0, 160)}{idea.description.length > 160 ? "…" : ""}</p>
              <div className="dvcIdeaCardFooter">
                <span className="dvcUpvotePill">▲ {idea.upvoteCount}</span>
                <span className="dvcIdeaCommentCount">💬 {idea.commentCount}</span>
                {idea.authorPseudonym ? <span className="dvcIdeaAuthor">@{idea.authorPseudonym}</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {detailIdea ? (
        <IdeaDetailPanel
          idea={detailIdea}
          apiBase={apiBase}
          ownerToken={account?.rsvpToken ?? null}
          voterToken={voterToken}
          onClose={() => setDetailIdea(null)}
          onDeleted={() => { setDetailIdea(null); void loadIdeas(); }}
        />
      ) : null}
    </div>
  );
};
