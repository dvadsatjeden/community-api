import React, { useEffect, useState, type ReactElement } from "react";
import type { IdeaCategory, IdeaItem, IdeaComment, IdeaCommentKind, IdeaFormPayload } from "./ideasApi";
import { deleteComment, deleteIdea, fetchComments, fetchIdea, postComment, toggleUpvote, updateIdea } from "./ideasApi";
import { CreateIdeaForm } from "./CreateIdeaForm";

const KIND_LABELS: Record<IdeaCommentKind, string> = {
  comment: "Komentár",
  suggestion: "Návrh",
  remark: "Pripomienka",
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("sk-SK", { day: "numeric", month: "short", year: "numeric" });

const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,!?;:]/g;

const linkifyText = (text: string): React.ReactNode => {
  const result: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result.push(text.slice(last, m.index));
    result.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer" className="dvcIdeaLink">
        {m[0]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) result.push(text.slice(last));
  return result.length === 0 ? text : result.length === 1 ? result[0] : <>{result}</>;
};

type Props = {
  idea: IdeaItem;
  apiBase: string;
  ownerToken: string | null;
  voterToken: string;
  categories: IdeaCategory[];
  onClose: () => void;
  onDeleted: () => void;
  onUpdated?: () => void;
};

type CommentFilter = "all" | IdeaCommentKind;

export const IdeaDetailPanel = ({ idea: initialIdea, apiBase, ownerToken, voterToken, categories, onClose, onDeleted, onUpdated }: Props): ReactElement => {
  const [idea, setIdea] = useState(initialIdea);
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [commentKind, setCommentKind] = useState<IdeaCommentKind>("comment");
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [commentBody, setCommentBody] = useState("");
  const [commentPseudo, setCommentPseudo] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [upvoting, setUpvoting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSignalPopup, setShowSignalPopup] = useState(false);

  // Fetch full detail (with isOwner) when panel opens
  useEffect(() => {
    const token = ownerToken ?? voterToken;
    void fetchIdea(apiBase, initialIdea.id, token).then(setIdea).catch(() => null);
    void fetchComments(apiBase, initialIdea.id, ownerToken ?? undefined).then(setComments).catch(() => null);
  }, [apiBase, initialIdea.id, ownerToken, voterToken]);

  const isOwner = idea.isOwner === true;

  const handleUpvote = async (): Promise<void> => {
    if (upvoting) return;
    setUpvoting(true);
    try {
      const result = await toggleUpvote(apiBase, voterToken, idea.id, idea.myUpvote === true);
      setIdea((prev) => ({ ...prev, upvoteCount: result.upvoteCount, myUpvote: result.upvoted }));
    } catch { /* ignore */ } finally {
      setUpvoting(false);
    }
  };

  const handleComment = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!ownerToken) return;
    setCommentError(null);
    setSubmittingComment(true);
    try {
      const comment = await postComment(apiBase, ownerToken, idea.id, {
        kind: commentKind,
        body: commentBody.trim(),
        authorPseudonym: commentPseudo.trim() || undefined,
      });
      setComments((prev) => [...prev, comment]);
      setIdea((prev) => ({ ...prev, commentCount: prev.commentCount + 1 }));
      setCommentBody("");
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (cid: string): Promise<void> => {
    if (!ownerToken) return;
    try {
      await deleteComment(apiBase, ownerToken, idea.id, cid);
      setComments((prev) => prev.filter((c) => c.id !== cid));
      setIdea((prev) => ({ ...prev, commentCount: Math.max(0, prev.commentCount - 1) }));
    } catch { /* ignore */ }
  };

  const handleDeleteIdea = async (): Promise<void> => {
    if (!ownerToken || deleting) return;
    if (!window.confirm("Zmazať tento nápad?")) return;
    setDeleting(true);
    try {
      await deleteIdea(apiBase, ownerToken, idea.id);
      onDeleted();
    } catch { setDeleting(false); }
  };

  const handleUpdate = async (payload: IdeaFormPayload): Promise<void> => {
    if (!ownerToken) return;
    const updated = await updateIdea(apiBase, ownerToken, idea.id, payload);
    setIdea((prev) => ({ ...prev, ...updated }));
    setEditing(false);
    onUpdated?.();
  };

  const handleArchiveToggle = async (): Promise<void> => {
    if (!ownerToken || archiving) return;
    setArchiving(true);
    try {
      const newStatus = idea.status === "archived" ? "published" : "archived";
      const updated = await updateIdea(apiBase, ownerToken, idea.id, { status: newStatus });
      setIdea((prev) => ({ ...prev, status: updated.status }));
      onUpdated?.();
    } catch { /* ignore */ } finally {
      setArchiving(false);
    }
  };

  const filteredComments = commentFilter === "all" ? comments : comments.filter((c) => c.kind === commentFilter);
  const countByKind = (k: IdeaCommentKind) => comments.filter((c) => c.kind === k).length;

  return (
    <div className="dvcModal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dvcModalPanel dvcIdeaDetailPanel" role="dialog" aria-modal="true" aria-label={idea.title}>
        <button className="dvcModalClose" type="button" onClick={onClose} aria-label="Zavrieť">×</button>

        {editing ? (
          <>
            <h2 className="dvcModalTitle" style={{ marginBottom: "16px", paddingRight: "44px" }}>Upraviť nápad</h2>
            <CreateIdeaForm
              categories={categories}
              initialValues={{
                title: idea.title,
                description: idea.description,
                categoryId: idea.categoryId,
                categoryOther: idea.categoryOther,
                websiteUrl: idea.websiteUrl,
                signalUrl: idea.signalUrl,
                authorPseudonym: idea.authorPseudonym,
              }}
              submitLabel="Uložiť zmeny"
              onSubmit={handleUpdate}
              onCancel={() => setEditing(false)}
            />
          </>
        ) : (
          <>
            <div className="dvcIdeaDetailMeta">
              <span className="dvcIdeaCategoryBadge">{idea.categoryOther ?? idea.categoryId}</span>
              {idea.status === "archived" ? <span className="dvcIdeaArchiveBadge">Archív</span> : null}
              <span className="dvcIdeaDetailDate">{formatDate(idea.createdAt)}</span>
              {idea.authorPseudonym ? <span className="dvcIdeaAuthor">@{idea.authorPseudonym}</span> : null}
            </div>

            <h2 className="dvcModalTitle" style={{ marginBottom: "10px", paddingRight: "44px" }}>{idea.title}</h2>

            <p className="dvcIdeaDetailDesc">{linkifyText(idea.description)}</p>

            {/* Web + Signal links */}
            {(idea.websiteUrl || idea.signalUrl) ? (
              <div className="dvcIdeaLinks">
                {idea.websiteUrl ? (
                  <a href={idea.websiteUrl} target="_blank" rel="noopener noreferrer" className="dvcBtn dvcBtnGhost dvcBtn--sm dvcIdeaLinkBtn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" stroke="currentColor" strokeWidth="1.8"/>
                    </svg>
                    Web
                  </a>
                ) : null}
                {idea.signalUrl ? (
                  <div className="dvcSignalWrap">
                    <button
                      type="button"
                      className="dvcBtn dvcBtnGhost dvcBtn--sm dvcIdeaLinkBtn dvcIdeaSignalBtn"
                      onClick={() => setShowSignalPopup((v) => !v)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.96 9.96 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                      </svg>
                      Signal skupina
                    </button>
                    {showSignalPopup ? (
                      <div className="dvcSignalPopup">
                        <p className="dvcSignalPopupText">Otváraš externú Signal skupinu. Pokračovať?</p>
                        <div className="dvcRow" style={{ gap: "8px" }}>
                          <a
                            href={idea.signalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dvcBtn dvcBtnPrimary dvcBtn--sm"
                            onClick={() => setShowSignalPopup(false)}
                          >
                            Otvoriť Signal
                          </a>
                          <button type="button" className="dvcBtn dvcBtnGhost dvcBtn--sm" onClick={() => setShowSignalPopup(false)}>
                            Zrušiť
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Actions row */}
            <div className="dvcIdeaActions">
              <button
                type="button"
                className={`dvcUpvoteBtn ${idea.myUpvote ? "dvcUpvoteBtn--active" : ""}`}
                onClick={() => void handleUpvote()}
                disabled={upvoting}
                aria-label={idea.myUpvote ? "Zrušiť hlas" : "Hlasovať za nápad"}
              >
                <span className="dvcUpvoteIcon">▲</span>
                <span className="dvcUpvoteCount">{idea.upvoteCount}</span>
              </button>
              <span className="dvcIdeaCommentCount">💬 {idea.commentCount}</span>

              {isOwner ? (
                <div className="dvcIdeaOwnerActions">
                  <button
                    type="button"
                    className="dvcBtn dvcBtnGhost dvcBtn--sm"
                    onClick={() => setEditing(true)}
                  >
                    Upraviť
                  </button>
                  <button
                    type="button"
                    className="dvcBtn dvcBtnGhost dvcBtn--sm"
                    onClick={() => void handleArchiveToggle()}
                    disabled={archiving}
                  >
                    {archiving ? "…" : idea.status === "archived" ? "Obnoviť" : "Archivovať"}
                  </button>
                  <button
                    type="button"
                    className="dvcBtn dvcBtnGhost dvcBtn--sm dvcBtn--danger"
                    onClick={() => void handleDeleteIdea()}
                    disabled={deleting}
                  >
                    {deleting ? "…" : "Zmazať"}
                  </button>
                </div>
              ) : null}
            </div>

            <hr className="dvcDivider" style={{ margin: "16px 0" }} />

            {/* Comments */}
            <div className="dvcIdeaComments">
              {/* Tabs */}
              {comments.length > 0 ? (
                <div className="dvcIdeaCommentTabs">
                  {(["all", "comment", "suggestion", "remark"] as const).map((k) => {
                    const count = k === "all" ? comments.length : countByKind(k);
                    if (k !== "all" && count === 0) return null;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={commentFilter === k ? "dvcCommentTab dvcCommentTab--active" : "dvcCommentTab"}
                        onClick={() => setCommentFilter(k)}
                      >
                        {k === "all" ? "Všetko" : KIND_LABELS[k]}
                        <span className="dvcCommentTabCount">{count}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {filteredComments.length === 0 && comments.length === 0 ? (
                <p className="dvcMuted dvcMuted--sm" style={{ marginBottom: "14px" }}>Zatiaľ žiadne komentáre.</p>
              ) : filteredComments.length === 0 ? (
                <p className="dvcMuted dvcMuted--sm" style={{ marginBottom: "14px" }}>Žiadne v tejto kategórii.</p>
              ) : (
                <div className="dvcIdeaCommentList">
                  {filteredComments.map((c) => (
                    <div key={c.id} className={`dvcIdeaComment dvcIdeaComment--${c.kind}`}>
                      <div className="dvcIdeaCommentHeader">
                        <span className={`dvcIdeaCommentKind dvcIdeaCommentKind--${c.kind}`}>{KIND_LABELS[c.kind]}</span>
                        {c.authorPseudonym ? <span className="dvcIdeaAuthor">@{c.authorPseudonym}</span> : null}
                        <span className="dvcIdeaDetailDate" style={{ marginLeft: "auto" }}>{formatDate(c.createdAt)}</span>
                        {ownerToken && c.isOwner ? (
                          <button
                            type="button"
                            className="dvcIdeaCommentDelete"
                            onClick={() => void handleDeleteComment(c.id)}
                            title="Zmazať komentár"
                          >×</button>
                        ) : null}
                      </div>
                      <p className="dvcIdeaCommentBody">{linkifyText(c.body)}</p>
                    </div>
                  ))}
                </div>
              )}

              {ownerToken ? (
                <form className="dvcIdeaCommentForm" onSubmit={(e) => void handleComment(e)}>
                  <div className="dvcFieldRow dvcFieldRow--tight">
                    <div className="dvcRow" style={{ gap: "8px" }}>
                      {(["comment", "suggestion", "remark"] as IdeaCommentKind[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={commentKind === k ? "dvcFilterChip dvcFilterChip--active" : "dvcFilterChip"}
                          style={{ padding: "0 12px", lineHeight: "30px", minHeight: "32px", fontSize: "0.78rem" }}
                          onClick={() => setCommentKind(k)}
                        >
                          {KIND_LABELS[k]}
                        </button>
                      ))}
                    </div>
                    <label className="dvcLabel" htmlFor="idea-comment-body">Tvoj príspevok</label>
                    <textarea
                      id="idea-comment-body"
                      className="dvcTextarea"
                      style={{ minHeight: "72px" }}
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Napíš komentár, návrh alebo pripomienku…"
                      required
                    />
                    <input
                      className="dvcInput"
                      type="text"
                      value={commentPseudo}
                      onChange={(e) => setCommentPseudo(e.target.value)}
                      placeholder="Prezývka (voliteľné)"
                      maxLength={80}
                    />
                    {commentError ? <p className="dvcFieldError">{commentError}</p> : null}
                    <button type="submit" className="dvcBtn dvcBtnPrimary" disabled={submittingComment}>
                      {submittingComment ? "Pridávam…" : "Pridať komentár"}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="dvcMuted dvcMuted--sm">Pre komentovanie potrebuješ účet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
