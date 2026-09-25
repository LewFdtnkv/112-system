"""Compare grounded rewriting with and without generic style examples; no DB writes."""

import json
import time
import urllib.request

from app.core.config import settings
from app.services.generation.narration import fallback
from scripts.evaluate_generation import sample

CASES = [
    ("fire-rubbish", {"message_format": "sms", "caller_information": "anonymous"}),
    ("road-collision", {"victims_count": 2, "has_victims": True}),
    ("medical-faint", {}),
    ("gas-stove", {}),
    (
        "fire-rubbish",
        {"address_format": "descriptive", "caller_information": "name_only", "caller_name": "Анна"},
    ),
]
EXAMPLES = (
    "Примеры подачи, не источник фактов новой ситуации:\n"
    "СМС: У нас во дворе загорелась куча мусора. Прямо пламя видно и дым идёт. Это "
    "[АДРЕС].\n"
    "Монолог: Алло, вы слышите? Здесь машины столкнулись, две. [АДРЕС], прямо на "
    "дороге. Двум людям нужна помощь! Выбраться они могут, никто не зажат. Машины "
    "не горят, подъехать сюда можно. Я [ИМЯ].\n"
    "Монолог: Помогите, человек без сознания! Дышит, да, но в себя не приходит. "
    "Взрослый. Мы в магазине, [АДРЕС]. Подойти к нему можно. Нет, от помощи никто "
    "не отказывался. Меня зовут [ИМЯ]."
)


def main():
    for method in ["facts", "examples"]:
        for i, (template, params) in enumerate(CASES):
            data = sample(template, seed=20260925 + i, parameters=params)
            original = fallback(data).caller_message
            speech, *observations = original.split("\n\nСведения, доступные оператору:\n")
            tokens = {}
            for key, label in [("Адрес", "АДРЕС"), ("ФИО заявителя", "ИМЯ")]:
                value = data["facts"].get(key)
                if value:
                    tokens["[" + label + "]"] = value
                    speech = speech.replace(value, "[" + label + "]")
            instruction = (
                "Напиши естественное сообщение очевидца в 112, а не перечень полей анкеты. "
                'Верни JSON {"message":"..."}. Сохрани ВСЕ факты исходника, включая отрицательные. '
                "Не добавляй причин, действий, опасностей, травм, "
                "времени ожидания или иных фактов. "
                "Разрешены разговорные связки, короткие вопросы, эмоциональная речь. "
                "Никаких инструкций оператору о заполнении полей или номерах служб. "
                "Не произноси пол заявителя отдельной фразой. "
                "Сохрани маркеры [АДРЕС] и [ИМЯ] буквально по одному разу, если они есть. "
                "Не возвращай префикс СМС. СМС короткое и без приветствий; "
                "звонок — связный монолог. "
                "Наблюдения оператора НЕ пересказывай, это не слова заявителя. "
                "Пол и возраст заявителя не приписывай пострадавшему.\n"
            )
            prompt = (
                instruction
                + (EXAMPLES + "\n" if method == "examples" else "")
                + json.dumps(
                    {
                        "канал": data["narrative"]["message_format"],
                        "исходные факты": speech,
                        "наблюдения оператора": observations,
                    },
                    ensure_ascii=False,
                )
            )
            req = urllib.request.Request(
                settings.llm_base_url + "/api/chat",
                json.dumps(
                    {
                        "model": settings.llm_model,
                        "stream": False,
                        "think": False,
                        "format": {
                            "type": "object",
                            "properties": {"message": {"type": "string"}},
                            "required": ["message"],
                            "additionalProperties": False,
                        },
                        "messages": [{"role": "user", "content": prompt}],
                        "keep_alive": "5m",
                        "options": {
                            "num_ctx": 4096,
                            "num_predict": 650,
                            "temperature": 0.7,
                            "seed": 20260925 + i,
                        },
                    }
                ).encode(),
                headers={"Content-Type": "application/json"},
            )
            start = time.monotonic()
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    result = json.load(r)
                text = json.loads(result["message"]["content"])
                error = None
            except Exception as e:
                result = {}
                text = None
                error = str(e)
            print(
                json.dumps(
                    {
                        "method": method,
                        "template": template,
                        "input": data,
                        "baseline": original,
                        "prompt": prompt,
                        "text": text,
                        "seconds": round(time.monotonic() - start, 2),
                        "error": error,
                        "done_reason": result.get("done_reason"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )


if __name__ == "__main__":
    main()
