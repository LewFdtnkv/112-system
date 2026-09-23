"""Read-only learning projections. No hint engine, mastery inference or hidden penalties."""

from app.schemas.learning import LearningMeasure, LearningResult


def learning_result(attempts, grade=None):
    completed = [a for a in attempts if a.ended_at is not None]
    intervals = sorted((a.started_at, a.ended_at) for a in completed)
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    seconds = sum(max(0, (end - start).total_seconds()) for start, end in merged)
    return LearningResult(
        assistance_available=any(
            a.settings_snapshot.get("learning_engine")
            and a.settings_snapshot.get("learning", {})
            .get("assistance", {})
            .get("max_level", "none")
            != "none"
            for a in attempts
        ),
        correctness=LearningMeasure(
            status="available" if grade else "pending",
            value=round(float(grade.score * 100 / grade.max_score), 2) if grade else None,
            explanation=(
                "Итоговая оценка преподавателя."
                if grade and grade.method == "teacher"
                else "Правила и смысловая проверка ИИ; полнота проверки указана в результате."
                if grade and grade.method == "hybrid"
                else "Проверенные формальные критерии; "
                "статус смысловой проверки указан в результате."
            ),
        ),
        independence=LearningMeasure(
            explanation=(
                "Самостоятельность пока не оценивалась. "
                "Отсутствие подсказок не означает освоения навыка."
            )
        ),
        interface=LearningMeasure(explanation="Владение интерфейсом пока не оценивалось."),
        duration=LearningMeasure(
            status="available" if completed else "pending",
            value=round(seconds) if completed else None,
            unit="seconds",
            explanation=(
                "Время завершённых попыток без двойного учёта пересечений, "
                "включая ожидание. Не влияет на балл."
            ),
        ),
    )
