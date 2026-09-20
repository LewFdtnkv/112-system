"""Synthetic training material, not a normative EKP edition or real response algorithm."""

from urllib.parse import urlencode

CATEGORIES = [
    (
        "fire",
        "Пожары",
        [
            "Дым в квартире",
            "Огонь в хозяйственной постройке",
            "Горение автомобиля",
            "Дым в подвале",
            "Возгорание мусора",
            "Пожарная сигнализация",
        ],
        [
            ("people_at_risk", "Есть угроза людям"),
            ("gas_equipment", "Есть газовое оборудование"),
            ("road_blocked", "Движение перекрыто"),
        ],
    ),
    (
        "police",
        "Происшествия на дороге и охрана порядка",
        [
            "Столкновение автомобилей",
            "Наезд на пешехода",
            "Препятствие на дороге",
            "Повреждение имущества",
            "Драка во дворе",
            "Подозрительный предмет",
        ],
        [
            ("injured", "Есть пострадавшие"),
            ("trapped", "Люди заблокированы"),
            ("fire", "Есть возгорание"),
        ],
    ),
    (
        "medical",
        "Помощь пострадавшим",
        [
            "Потеря сознания",
            "Травма при падении",
            "Боль в груди",
            "Порез и кровотечение",
            "Плохое самочувствие ребёнка",
            "Несколько пострадавших",
        ],
        [
            ("access_blocked", "Доступ к человеку закрыт"),
            ("violence", "Есть угроза насилия"),
            ("multiple_victims", "Несколько пострадавших"),
        ],
    ),
    (
        "gas",
        "Газовые происшествия",
        [
            "Запах газа в квартире",
            "Запах газа на улице",
            "Повреждение газовой трубы",
            "Запах газа в подъезде",
            "Неисправность газовой плиты",
            "Утечка у газового шкафа",
        ],
        [
            ("fire", "Есть открытое пламя"),
            ("injured", "Есть пострадавшие"),
            ("road_blocked", "Движение перекрыто"),
        ],
    ),
    (
        "utility",
        "Коммунальные происшествия",
        [
            "Дерево во дворе",
            "Вода из колодца",
            "Затопление подвала",
            "Повреждение теплотрассы",
            "Обрыв провода",
            "Отсутствие освещения",
        ],
        [
            ("people_at_risk", "Есть угроза людям"),
            ("road_blocked", "Движение перекрыто"),
            ("electrical_risk", "Есть опасность поражения током"),
        ],
    ),
    (
        "rescue",
        "Спасательные работы",
        [
            "Человек застрял в лифте",
            "Ребёнок заперт в помещении",
            "Человек на воде",
            "Обрушение конструкции",
            "Люди под завалом",
            "Человек на высоте",
        ],
        [
            ("injured", "Есть пострадавшие"),
            ("fire", "Есть возгорание"),
            ("road_blocked", "Движение перекрыто"),
        ],
    ),
]
NAMES = {
    "fire": "Учебная пожарная служба",
    "police": "Учебная полиция",
    "medical": "Учебная скорая помощь",
    "gas": "Учебная газовая служба",
    "utility": "Учебная коммунальная служба",
    "rescue": "Учебные спасатели",
    "power": "Учебная электросеть",
}
TARGETS = {
    "people_at_risk": "medical",
    "gas_equipment": "gas",
    "road_blocked": "police",
    "injured": "medical",
    "trapped": "rescue",
    "fire": "fire",
    "access_blocked": "rescue",
    "violence": "police",
    "multiple_victims": "rescue",
    "electrical_risk": "power",
}


def answer_text(value):
    if type(value) is bool:
        return "да" if value else "нет"
    return ", ".join(value) if isinstance(value, list) else value


def material(prefix):
    entries = []
    for section_index, (service, section, names, features) in enumerate(CATEGORIES, 1):
        for index, name in enumerate(names, 1):
            routes = [{"service_code": f"{prefix}-{service}", "is_main": True, "when": {}}]
            used = {service}
            for key, _ in features:
                target = TARGETS[key]
                if target not in used:
                    routes.append(
                        {
                            "service_code": f"{prefix}-{target}",
                            "is_main": False,
                            "when": {key: True},
                        }
                    )
                    used.add(target)
            entries.append(
                {
                    "code": f"TRAIN.{section_index:02d}.{index:02d}",
                    "section": section,
                    "name": name,
                    "display_name": name,
                    "is_popular": False,
                    "popular_order": 0,
                    "notification_required": True,
                    "response_scenario": (
                        "Искусственная учебная маршрутизация. Не "
                        "использовать для реального реагирования."
                    ),
                    "features": [{"key": k, "label": label} for k, label in features]
                    + [
                        {
                            "key": "place",
                            "label": "Где произошло",
                            "type": "choice",
                            "required": True,
                            "options": ["Дом", "Улица", "Транспорт", "Здание / объект"],
                        },
                        {
                            "key": "details",
                            "label": "Дополнительные признаки",
                            "type": "array",
                            "required": False,
                            "options": ["Нет доступа", "Затруднён проезд", "Повторное обращение"],
                        },
                        {
                            "key": "witness",
                            "label": "Заявитель — очевидец",
                            "type": "boolean",
                            "required": False,
                        },
                    ],
                    "routes": routes,
                }
            )
    popular = {
        "TRAIN.02.01": ("ДТП", 0),
        "TRAIN.01.01": ("Пожар", 1),
        "TRAIN.04.01": ("104", 3),
        "TRAIN.06.01": ("Человек в опасности", 4),
    }
    for entry in entries:
        if entry["code"] in popular:
            label, order = popular[entry["code"]]
            entry.update(display_name=label, is_popular=True, popular_order=order)
    for index, (name, order) in enumerate(
        [
            ("Ошибочно набран номер", 2),
            ("Отмена вызова", 5),
            ("Тестовый вызов", 6),
            ("Передача дежурства", 7),
            ("Консультация", 8),
            ("Вызов на иностранном языке", 9),
            ("Справка-101", 10),
        ],
        1,
    ):
        entries.append(
            {
                "code": f"TRAIN.INFO.{index:02d}",
                "section": "Служебные обращения",
                "name": name,
                "display_name": name,
                "is_popular": True,
                "popular_order": order,
                "notification_required": False,
                "features": [],
                "routes": [],
                "response_scenario": "Учебная регистрация обращения без оповещения служб.",
            }
        )
    return {
        "format": "system112-ekp-v1",
        "label": f"{prefix}-synthetic-ekp-v3-43",
        "services": [
            {
                "code": f"{prefix}-{key}",
                "name": name,
                "short_name": {
                    "fire": "Служба 101",
                    "police": "Служба 102",
                    "medical": "Служба 103",
                    "gas": "Служба 104",
                    "rescue": "Спасатели",
                    "power": "Электросети",
                    "utility": "ЖКХ",
                }.get(key, name),
            }
            for key, name in NAMES.items()
        ],
        "entries": entries,
    }


def populate(state, admin, teacher, student, group_id):
    prefix = state.data["prefix"]
    document = material(prefix)
    version = state.create("expanded-classifier-v3", admin, "admin/classifiers/import", document)
    admin.request("POST", f"admin/classifiers/{version}/publish")
    entries = teacher.request("GET", f"classifiers/{version}/entries?limit=100")
    by_code = {e["code"]: e["id"] for e in entries}
    services = admin.request(
        "GET", "views/admin/services?" + urlencode({"q": prefix + "-", "limit": 100})
    )["items"]
    service_ids = {s["code"]: s["id"] for s in services}
    profile_ids = {}
    for key, name in NAMES.items():
        sid = service_ids[f"{prefix}-{key}"]
        pid = state.create(
            f"profile-v2-{key}",
            admin,
            "admin/service-profiles",
            {
                "service_id": sid,
                "name": f"{prefix}: {name}",
                "responsibility": (
                    f"Учебные объекты и территории, указанные в карточках для службы «{name}»."
                ),
                "procedure": (
                    "Проверьте принадлежность карточки службе. Фиксируйте статус и "
                    "номер наряда по сообщениям занятия. Все действия учебные."
                ),
                "territories": [
                    {
                        "code": "training",
                        "name": "Учебный район",
                        "description": "Условная территория тренажёра",
                    }
                ],
                "objects": [
                    {
                        "code": "training-center",
                        "name": "Учебный центр",
                        "territory_code": "training",
                        "address": "Учебная улица, дом 1",
                        "responsibility": "Учебный объект",
                    }
                ],
                "contacts": [
                    {
                        "code": "duty",
                        "name": "Учебный дежурный",
                        "target_service_id": sid,
                        "position": "Дежурный",
                        "description": "Для учебного согласования действий",
                        "endpoint_key": f"{prefix}_{key}_duty",
                    }
                ],
            },
        )
        admin.request("POST", f"admin/service-profiles/{pid}/publish")
        profile_ids[key] = pid
    selected = [
        e
        for e in document["entries"]
        if e["notification_required"] and e["code"].endswith((".01", ".02"))
    ]
    cards = []
    cases = []
    for index, entry in enumerate(selected, 1):
        answers = {
            f["key"]: (
                f["options"][index % len(f["options"])]
                if f.get("type") == "choice"
                else [f["options"][0]]
                if f.get("type") == "array"
                else (index % 2 == 0 if n != 1 else index % 3 == 0)
            )
            for n, f in enumerate(entry["features"])
        }
        targets = [
            service_ids[r["service_code"]]
            for r in entry["routes"]
            if all(answers[k] is v for k, v in r["when"].items())
        ]
        address = f"Учебная улица, дом {index}"
        facts = "; ".join(
            f"{f['label']}: {answer_text(answers[f['key']])}" for f in entry["features"]
        )
        data = {
            "address_text": address,
            "address_details": {"street": "Учебная улица", "house": str(index)},
            "description": entry["name"],
            "caller_name": "Учебный заявитель",
            "features": {"ekp": answers},
            "additional_fields": {},
        }
        message = f"{entry['name']}. Адрес: {address}. Сообщает Учебный заявитель. {facts}."
        card = state.create(
            f"expanded-card-v3-{index}",
            teacher,
            "cards",
            {
                "title": entry["name"],
                "classifier_version_id": version,
                "classifier_entry_id": by_code[entry["code"]],
                "caller_message": message,
                "instructions": "Учебная ситуация: заполните сведения и все признаки по сообщению.",
                "data": data,
                "recipient_service_ids": targets,
            },
        )
        cards.append(card)
        cases.append((data, by_code[entry["code"]], targets))
    scenario = state.create(
        "expanded-scenario-v3",
        teacher,
        "scenarios",
        {
            "title": f"{prefix}: 12 ситуаций и условные признаки",
            "role": "operator_112",
            "card_ids": cards,
            "instructions": (
                "Сведения для каждого признака приведены в условии. Все данные искусственные."
            ),
        },
    )
    student_id = state.data["ids"]["student"]

    def launch(key, scenario_id, title):
        row = teacher.request(
            "POST",
            "lessons/start",
            {
                "request_id": state.request_id(key),
                "group_id": group_id,
                "student_id": student_id,
                "scenario_version_id": scenario_id,
                "title": f"{prefix}: {title}",
            },
            expected=(200, 201),
        )
        return state.remember(key, row["id"])

    verified = launch("expanded-verified-v3", scenario, "проверка 12 ситуаций")
    work = student.request("GET", f"student/lessons/{verified}")
    for assignment, (data, entry_id, targets) in zip(work["assignments"], cases, strict=True):
        attempt = student.request(
            "POST", f"student/assignments/{assignment['id']}/start", expected=(200, 201)
        )
        if attempt["status"] == "completed":
            continue
        path = f"student/attempts/{attempt['id']}"
        filled = student.request(
            "PUT",
            f"{path}/card",
            {
                "revision": attempt["card"]["revision"],
                "classifier_entry_id": entry_id,
                "data": data,
            },
        )
        if {r["service_id"] for r in filled["recipient_services"]} != set(targets):
            raise RuntimeError("Условная маршрутизация не совпала с демонстрационным эталоном")
        student.request("POST", f"{path}/submit", {"revision": filled["card"]["revision"]})
    grade = student.request("GET", f"student/lessons/{verified}/evaluation")
    if grade["score"] != "100.00":
        raise RuntimeError("Не совпал автоматический результат 12 ситуаций")
    ready = launch("expanded-ready-v3", scenario, "12 ситуаций для самостоятельного прохождения")
    steps = [
        {
            "status": "accepted",
            "message": (
                "Учебная карточка адресована вашей пожарной "
                "службе и относится к её ответственности."
            ),
            "crew_number": None,
        },
        {
            "status": "responding",
            "message": "Дежурный сообщает: наряд УЧ-42 выехал к месту происшествия.",
            "crew_number": "УЧ-42",
        },
        {
            "status": "arrived",
            "message": "Наряд УЧ-42 сообщил о прибытии на место.",
            "crew_number": "УЧ-42",
        },
        {
            "status": "in_progress",
            "message": "Наряд УЧ-42 приступил к проведению работ.",
            "crew_number": "УЧ-42",
        },
        {
            "status": "completed",
            "message": "Наряд УЧ-42 сообщил: работы нашей службы завершены.",
            "crew_number": "УЧ-42",
        },
    ]
    dds = state.create(
        "dds-scenario-v3",
        teacher,
        "scenarios",
        {
            "title": f"{prefix}: ДДС пожарной службы",
            "role": "dds",
            "service_profile_id": profile_ids["fire"],
            "card_ids": cards[:2],
            "dds_policy": {"steps": steps},
            "instructions": (
                "Зафиксируйте реагирование своей службы по "
                "сообщениям. Сведения других служб не изменяйте."
            ),
        },
    )
    dds_verified = launch("dds-verified-v3", dds, "проверка реагирования ДДС")
    work = student.request("GET", f"student/lessons/{dds_verified}")
    for assignment in work["assignments"]:
        attempt = student.request(
            "POST", f"student/assignments/{assignment['id']}/start", expected=(200, 201)
        )
        if attempt["status"] == "completed":
            continue
        path = f"student/attempts/{attempt['id']}/dds"
        for index in range(len(attempt["dds"]["history"]), len(steps)):
            step = steps[index]
            attempt = student.request(
                "POST",
                f"{path}/actions",
                {
                    "request_id": state.request_id(f"{assignment['id']}-step-{index}"),
                    "revision": attempt["dds"]["revision"],
                    "information_event_id": attempt["dds"]["information"]["id"],
                    "status": step["status"],
                    "crew_number": step["crew_number"],
                    "comment": step["message"],
                },
            )
        student.request("POST", f"{path}/submit", {"revision": attempt["dds"]["revision"]})
    grade = student.request("GET", f"student/lessons/{dds_verified}/evaluation")
    if grade["score"] != "100.00":
        raise RuntimeError("Не совпал автоматический результат ДДС")
    dds_ready = launch("dds-ready-v3", dds, "ДДС для самостоятельного прохождения")
    return {
        "expanded_classifier_id": version,
        "expanded_entry_count": len(document["entries"]),
        "expanded_case_count": len(cases),
        "expanded_ready_lesson_id": ready,
        "dds_ready_lesson_id": dds_ready,
        "service_profile_count": len(profile_ids),
    }
