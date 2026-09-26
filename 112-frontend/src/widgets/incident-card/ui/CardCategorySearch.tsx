import { ArmField } from "@/shared/ui/arm";
import { useEffect, useRef, useState } from "react";
import type { CardCategoryEditorProps } from "../types/CardCategoryEditor";
export function CardCategorySearch({
  editor,
  disabled,
}: CardCategoryEditorProps) {
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(false);
  const term = query.trim();
  const results = choosing && term.length > 0;
  const choices = results
    ? editor.remote.categories
    : (editor.remote.popularCategories ?? []).slice(0, 11);
  const resultList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (results) resultList.current?.scrollIntoView({ block: "nearest" });
  }, [results, choices.length]);
  const choose = (id: string) => {
    editor.setCategory(id);
    setQuery("");
    editor.remote.search("");
    setChoosing(false);
  };
  return (
    <div
      className="arm-category-search"
      data-guide-target="classifier_entry_id"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setChoosing(false);
      }}
    >
      <ArmField
        name="classifier_entry_id"
        label="Введите тип происшествия"
        aria-label="Тип происшествия"
        placeholder={
          editor.fields.categoryId
            ? "добавить тип происшествия"
            : "ЧТО СЛУЧИЛОСЬ?"
        }
        value={query}
        disabled={disabled}
        onFocus={() => setChoosing(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          editor.remote.search(event.target.value);
          setChoosing(true);
        }}
      />
      {(results || (!editor.fields.categoryId && !term)) && (
        <div
          ref={resultList}
          className={results ? "arm-category-results" : "arm-category-choices"}
        >
          {choices.map((category) => (
            <button
              disabled={disabled}
              key={category.id}
              onClick={() => choose(category.id)}
            >
              {category.name}
            </button>
          ))}
          {!results && choices.length > 0 && (
            <p className="arm-category-significant">
              Значимые типы происшествий:
            </p>
          )}
          {editor.remote.searching && <span>Загрузка…</span>}
          {editor.remote.error && (
            <span role="alert">{editor.remote.error}</span>
          )}
          {results && choices.length === 0 && !editor.remote.searching && (
            <span>Тип происшествия не найден.</span>
          )}
        </div>
      )}
    </div>
  );
}
