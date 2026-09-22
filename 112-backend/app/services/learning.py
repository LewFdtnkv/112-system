"""Read-only learning projections. No hint engine, mastery inference or hidden penalties."""

from app.schemas.learning import LearningMeasure, LearningResult


def learning_result(attempts, grade=None):
    completed = [a for a in attempts if a.ended_at is not None]
    seconds = sum(max(0, (a.ended_at - a.started_at).total_seconds()) for a in completed)
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
                else "Проверенные формальные критерии; смысловая проверка пока не выполняется."
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
            explanation="Сумма времени завершённых попыток, включая паузы. Не влияет на балл.",
        ),
    )
