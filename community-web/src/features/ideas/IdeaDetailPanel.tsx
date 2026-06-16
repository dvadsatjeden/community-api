import React, { useEffect, useState, type ReactElement } from "react";
import type { IdeaItem, IdeaComment, IdeaCommentKind } from "./ideasApi";
import { deleteComment, deleteIdea, fetchComments, postComment, toggleUpvote } from "./ideasApi";

const KIND_LABELS: Record<IdeaCommentKind, string> = {
  comment: "Komentár",
  suggestion: "Návrh",
  remark: "Pripomienka",
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("sk-SK", { day: "numeric", month: "short", year: "numeric" });

type Props = {
  idea: IdeaItem;
  apiBase: string;
  ownerToken: string | null;
  voterToken: string;
  onClose: () => void;
  onDeleted: () => void;
};

export const IdeaDetailPanel = ({ idea: initialIdea, apiBase, ownerToken, voterToken, onClose, onDeleted }: Props): ReactElement => {
  const [idea, setIdea] = useState(initialIdea);
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [commentKind, setCommentKind] = useState<IdeaCommentKind>("comment");
  const [commentBody, setCommentBody] = useState("");
  const [commentPseudo, setCommentPseudo] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [upvoting, setUpvoting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void fetchComments(apiBase, idea.id).then(setComments).catch(() => null);
  }, [apiBase, idea.id]);

  const handleUpvote = async (): Promise<void> => {
    if (upvoting) return;
    setUpvoting(true);
    try {
      const result = await toggleUpvote(apiBase, voterToken, idea.id);
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

  const isOwner = ownerToken !== null && idea.authorOwnerId === ownerToken.slice(0, 32);
  // Check ownership by comparing authorTokenHash — we don't have it client-side,
  // so we use a soft check: ownerToken present and authorOwnerId matches derived prefix.
  // The server enforces the real check.
  const canDelete = ownerToken !== null;

  return (
    <div className="dvcModal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dvcModalPanel dvcIdeaDetailPanel" role="dialog" aria-modal="true">
        <button className="dvcModalClose" type="button" onClick={onClose} aria-label="Zavrieť">×</button>

        <div className="dvcIdeaDetailMeta">
          <span className="dvcIdeaCategoryBadge">{idea.categoryOther ?? idea.categoryId}</span>
          <span className="dvcIdeaDetailDate">{formatDate(idea.createdAt)}</span>
          {idea.authorPseudonym ? <span className="dvcIdeaAuthor">@{idea.authorPseudonym}</span> : null}
        </div>

        <h2 className="dvcModalTitle" style={{ marginBottom: "10px", paddingRight: "44px" }}>{idea.title}</h2>

        <p className="dvcIdeaDetailDesc">{idea.description}</p>

        {/* Upvote */}
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
          <span className="dvcIdeaCommentCount">
            💬 {idea.commentCount}
          </span>
          {canDelete ? (
            <button
              type="button"
              className="dvcBtn dvcBtnGhost"
              style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "5px 10px", minHeight: "unset" }}
              onClick={() => void handleDeleteIdea()}
              disabled={deleting}
            >
              {deleting ? "…" : "Zmazať"}
            </button>
          ) : null}
        </div>

        <hr className="dvcDivider" style={{ margin: "16px 0" }} />

        {/* Comments */}
        <div className="dvcIdeaComments">
          {comments.length === 0 ? (
            <p className="dvcMuted dvcMuted--sm" style={{ marginBottom: "14px" }}>Zatiaľ žiadne komentáre.</p>
          ) : (
            <div className="dvcIdeaCommentList">
              {comments.map((c) => (
                <div key={c.id} className="dvcIdeaComment">
                  <div className="dvcIdeaCommentHeader">
                    <span className="dvcIdeaCommentKind">{KIND_LABELS[c.kind]}</span>
                    {c.authorPseudonym ? <span className="dvcIdeaAuthor">@{c.authorPseudonym}</span> : null}
                    <span className="dvcIdeaDetailDate" style={{ marginLeft: "auto" }}>{formatDate(c.createdAt)}</span>
                    {ownerToken ? (
                      <button
                        type="button"
                        className="dvcIdeaCommentDelete"
                        onClick={() => void handleDeleteComment(c.id)}
                        title="Zmazať komentár"
                      >×</button>
                    ) : null}
                  </div>
                  <p className="dvcIdeaCommentBody">{c.body}</p>
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
                <textarea
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
      </div>
    </div>
  );
};
