import React, { useState, type ReactElement } from "react";
import type { IdeaCategory, IdeaCategoryId } from "./ideasApi";

type Props = {
  categories: IdeaCategory[];
  onSubmit: (payload: {
    title: string;
    description: string;
    categoryId: IdeaCategoryId;
    categoryOther?: string;
    authorPseudonym?: string;
  }) => Promise<void>;
  onCancel: () => void;
};

export const CreateIdeaForm = ({ categories, onSubmit, onCancel }: Props): ReactElement => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<IdeaCategoryId>("community");
  const [categoryOther, setCategoryOther] = useState("");
  const [pseudonym, setPseudonym] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        categoryId,
        categoryOther: categoryId === "other" ? categoryOther.trim() : undefined,
        authorPseudonym: pseudonym.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nastala chyba");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="dvcIdeasForm" onSubmit={(e) => void handleSubmit(e)}>
      <div className="dvcFieldRow">
        <div>
          <label className="dvcLabel" htmlFor="idea-title">Názov nápadu</label>
          <input
            id="idea-title"
            className="dvcInput"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Krátky výstižný názov (5–120 znakov)"
            maxLength={120}
            required
          />
        </div>
        <div>
          <label className="dvcLabel" htmlFor="idea-category">Kategória</label>
          <select
            id="idea-category"
            className="dvcInput"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value as IdeaCategoryId)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        {categoryId === "other" ? (
          <div>
            <label className="dvcLabel" htmlFor="idea-other">Upresni kategóriu</label>
            <input
              id="idea-other"
              className="dvcInput"
              type="text"
              value={categoryOther}
              onChange={(e) => setCategoryOther(e.target.value)}
              placeholder="Napr. Lightning Network, Bezpečnosť..."
              required
            />
          </div>
        ) : null}
        <div>
          <label className="dvcLabel" htmlFor="idea-desc">Popis</label>
          <textarea
            id="idea-desc"
            className="dvcTextarea"
            style={{ minHeight: "120px" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Podrobnejší popis – čo navrhuješ, prečo by to malo zmysel, ako by to fungovalo (20–5000 znakov)"
            required
          />
        </div>
        <div>
          <label className="dvcLabel" htmlFor="idea-pseudo">Prezývka (voliteľné)</label>
          <input
            id="idea-pseudo"
            className="dvcInput"
            type="text"
            value={pseudonym}
            onChange={(e) => setPseudonym(e.target.value)}
            placeholder="Napr. Satoshi, Anonymous..."
            maxLength={80}
          />
        </div>
      </div>
      {error ? <p className="dvcFieldError">{error}</p> : null}
      <div className="dvcRow" style={{ marginTop: "16px", gap: "10px" }}>
        <button type="submit" className="dvcBtn dvcBtnPrimary" disabled={submitting}>
          {submitting ? "Pridávam…" : "Pridať nápad"}
        </button>
        <button type="button" className="dvcBtn dvcBtnGhost" onClick={onCancel}>
          Zrušiť
        </button>
      </div>
    </form>
  );
};
