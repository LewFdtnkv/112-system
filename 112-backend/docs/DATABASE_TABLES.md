# Полная схема таблиц

Снимок SQLAlchemy-моделей к `0007_exclusive_user_role` от 19.09.2026: 32 таблицы.

Объяснение учебного смысла и решений: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

UUID генерируются приложением. Все времена — `TIMESTAMP WITH TIME ZONE`.
Python defaults применяются ORM; здесь перечислены только SQL defaults.
PK — первичный ключ; `NULL` — допустимое отсутствие значения.
Для JSONB отдельно требуется валидация структуры в прикладном слое.

## `services`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `code` | `VARCHAR(50)` | нет | — | `—` |
| `name` | `VARCHAR(255)` | нет | — | `—` |
| `is_active` | `BOOLEAN` | нет | — | `true` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- UNIQUE `(code)`.

## `lesson_evaluations`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `lesson_id` | `UUID` | нет | — | `—` |
| `student_id` | `UUID` | нет | — | `—` |
| `reviewer_id` | `UUID` | нет | — | `—` |
| `request_id` | `UUID` | нет | — | `—` |
| `revision` | `INTEGER` | нет | — | `—` |
| `supersedes_id` | `UUID` | да | — | `—` |
| `score` | `NUMERIC(10,2)` | нет | — | `—` |
| `max_score` | `NUMERIC(10,2)` | нет | — | `—` |
| `comment` | `TEXT` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- FK `lesson_id` → `lessons.id`, `student_id` и `reviewer_id` → `users.id`; DELETE `RESTRICT`.
- FK `(supersedes_id, lesson_id, student_id)` → `lesson_evaluations.(id, lesson_id, student_id)`; DELETE `RESTRICT`.
- UNIQUE `(lesson_id, student_id, revision)`, `(lesson_id, student_id, request_id)`, `(id, lesson_id, student_id)`.
- CHECK `revision > 0`, `score >= 0 AND max_score > 0 AND score <= max_score`.
- CHECK `length(btrim(comment)) > 0`, `supersedes_id IS NULL OR supersedes_id != id`.
- INDEX `student_id`, `reviewer_id`, `supersedes_id`.

## `users`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | нет | да | `—` |
| `username` | `VARCHAR(50)` | нет | — | `—` |
| `password_hash` | `VARCHAR(255)` | нет | — | `—` |
| `first_name` | `VARCHAR(100)` | нет | — | `''` |
| `last_name` | `VARCHAR(100)` | нет | — | `''` |
| `middle_name` | `VARCHAR(100)` | да | — | `—` |
| `email` | `VARCHAR(254)` | да | — | `—` |
| `is_active` | `BOOLEAN` | нет | — | `true` |
| `is_teacher` | `BOOLEAN` | нет | — | `false` |
| `is_admin` | `BOOLEAN` | нет | — | `false` |
| `must_change_password` | `BOOLEAN` | нет | — | `true` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |
| `last_login_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `password_changed_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |

- CHECK `username = lower(username)`.
- CHECK `NOT (is_teacher AND is_admin)` — одна системная роль; оба флага `false` означают ученика.
- UNIQUE `(username)`.

## `auth_sessions`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `id` | `UUID` | нет | да | `—` |
| `user_id` | `UUID` | нет | — | `—` |
| `refresh_token_hash` | `VARCHAR(64)` | нет | — | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |
| `expires_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `—` |
| `revoked_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |

- FK `(user_id)` → `users.id`; DELETE `CASCADE`.
- INDEX `(user_id)`.
- UNIQUE `(refresh_token_hash)`.

## `classifier_versions`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `revision` | `INTEGER` | нет | — | `1` |
| `label` | `VARCHAR(100)` | нет | — | `—` |
| `source_filename` | `VARCHAR(255)` | нет | — | `—` |
| `source_storage_key` | `TEXT` | нет | — | `—` |
| `source_sha256` | `VARCHAR(64)` | нет | — | `—` |
| `status` | `VARCHAR(9)` | нет | — | `—` |
| `import_report` | `JSONB` | нет | — | `{}` |
| `approved_by_id` | `UUID` | да | — | `—` |
| `approved_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- CHECK `classifier_versions.status IN ('draft', 'published', 'archived')`.
- CHECK `source_sha256 ~ '^[0-9a-f]{64}$'`.
- CHECK `status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)`.
- FK `(approved_by_id)` → `users.id`; DELETE `RESTRICT`.
- UNIQUE `(label)`.

## `scenarios`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `title` | `VARCHAR(255)` | нет | — | `—` |
| `created_by_id` | `UUID` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- FK `(created_by_id)` → `users.id`; DELETE `RESTRICT`.

## `service_profiles`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `revision` | `INTEGER` | нет | — | `1` |
| `service_id` | `UUID` | нет | — | `—` |
| `version` | `INTEGER` | нет | — | `—` |
| `name` | `VARCHAR(255)` | нет | — | `—` |
| `status` | `VARCHAR(9)` | нет | — | `—` |
| `responsibility` | `TEXT` | нет | — | `—` |
| `rules` | `JSONB` | нет | — | `{}` |
| `approved_by_id` | `UUID` | да | — | `—` |
| `approved_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- CHECK `service_profiles.status IN ('draft', 'published', 'archived')`.
- CHECK `status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)`.
- CHECK `version > 0`.
- FK `(approved_by_id)` → `users.id`; DELETE `RESTRICT`.
- FK `(service_id)` → `services.id`; DELETE `RESTRICT`.
- UNIQUE `(service_id, version)`.

## `training_groups`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `name` | `VARCHAR(255)` | нет | — | `—` |
| `teacher_id` | `UUID` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- FK `(teacher_id)` → `users.id`; DELETE `RESTRICT`.
- INDEX `(teacher_id)`.

## `user_services`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `user_id` | `UUID` | нет | да | `—` |
| `service_id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- FK `(service_id)` → `services.id`; DELETE `RESTRICT`.
- FK `(user_id)` → `users.id`; DELETE `CASCADE`.
- INDEX `(service_id)`.

## `classifier_entries`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `classifier_version_id` | `UUID` | нет | — | `—` |
| `code` | `VARCHAR(50)` | нет | — | `—` |
| `section` | `VARCHAR(255)` | нет | — | `—` |
| `name` | `TEXT` | нет | — | `—` |
| `response_scenario` | `TEXT` | да | — | `—` |
| `conditions` | `JSONB` | нет | — | `{}` |
| `source_sheet` | `VARCHAR(100)` | нет | — | `—` |
| `source_row` | `INTEGER` | нет | — | `—` |
| `source_data` | `JSONB` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `source_row > 0`.
- FK `(classifier_version_id)` → `classifier_versions.id`; DELETE `RESTRICT`.
- UNIQUE `(classifier_version_id, code)`.
- UNIQUE `(id, classifier_version_id)`.

## `group_memberships`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `group_id` | `UUID` | нет | да | `—` |
| `user_id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- FK `(group_id)` → `training_groups.id`; DELETE `CASCADE`.
- FK `(user_id)` → `users.id`; DELETE `CASCADE`.
- INDEX `(user_id)`.

## `lessons`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `title` | `VARCHAR(255)` | нет | — | `—` |
| `teacher_id` | `UUID` | нет | — | `—` |
| `group_id` | `UUID` | да | — | `—` |
| `scenario_version_id` | `UUID` | да | — | `—` |
| `start_request_id` | `UUID` | да | — | `—` |
| `start_fingerprint` | `VARCHAR(64)` | да | — | `—` |
| `status` | `VARCHAR(9)` | нет | — | `—` |
| `started_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `ended_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- CHECK `ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at)`.
- CHECK `lessons.status IN ('planned', 'active', 'finished', 'cancelled')`.
- UNIQUE `(teacher_id, start_request_id)`.
- FK `(scenario_version_id)` → `scenario_versions.id`; DELETE `RESTRICT`.
- INDEX `(scenario_version_id)`.
- FK `(group_id)` → `training_groups.id`; DELETE `RESTRICT`.
- FK `(teacher_id)` → `users.id`; DELETE `RESTRICT`.
- INDEX `(group_id)`.
- INDEX `(teacher_id)`.

## `scenario_versions`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `scenario_id` | `UUID` | нет | — | `—` |
| `version` | `INTEGER` | нет | — | `—` |
| `title` | `VARCHAR(255)` | нет | — | `—` |
| `role` | `VARCHAR(12)` | нет | — | `—` |
| `status` | `VARCHAR(9)` | нет | — | `—` |
| `classifier_version_id` | `UUID` | нет | — | `—` |
| `service_profile_id` | `UUID` | да | — | `—` |
| `difficulty` | `VARCHAR(50)` | да | — | `—` |
| `category` | `VARCHAR(255)` | нет | — | `''` |
| `duration_minutes` | `INTEGER` | нет | — | `15` |
| `norm_seconds` | `INTEGER` | нет | — | `30` |
| `instructions` | `TEXT` | нет | — | `—` |
| `caller_message` | `TEXT` | да | — | `—` |
| `caller_audio_key` | `TEXT` | да | — | `—` |
| `initial_card` | `JSONB` | да | — | `—` |
| `scheduled_events` | `JSONB` | нет | — | `[]` |
| `hints` | `JSONB` | нет | — | `[]` |
| `completion_rules` | `JSONB` | нет | — | `{}` |
| `provenance` | `JSONB` | нет | — | `{}` |
| `approved_by_id` | `UUID` | да | — | `—` |
| `approved_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- CHECK `role != 'dds' OR service_profile_id IS NOT NULL`.
- CHECK `scenario_versions.role IN ('operator_112', 'dds')`.
- CHECK `scenario_versions.status IN ('draft', 'published', 'archived')`.
- CHECK `status = 'draft' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL)`.
- CHECK `version > 0`.
- FK `(approved_by_id)` → `users.id`; DELETE `RESTRICT`.
- FK `(classifier_version_id)` → `classifier_versions.id`; DELETE `RESTRICT`.
- FK `(scenario_id)` → `scenarios.id`; DELETE `RESTRICT`.
- FK `(service_profile_id)` → `service_profiles.id`; DELETE `RESTRICT`.
- INDEX `(classifier_version_id)`.
- INDEX `(service_profile_id)`.
- UNIQUE `(scenario_id, version)`.

## `service_territories`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `profile_id` | `UUID` | нет | — | `—` |
| `code` | `VARCHAR(100)` | нет | — | `—` |
| `name` | `VARCHAR(255)` | нет | — | `—` |
| `description` | `TEXT` | нет | — | `''` |
| `id` | `UUID` | нет | да | `—` |

- FK `(profile_id)` → `service_profiles.id`; DELETE `RESTRICT`.
- UNIQUE `(id, profile_id)`.
- UNIQUE `(profile_id, code)`.

## `training_contacts`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `profile_id` | `UUID` | нет | — | `—` |
| `target_service_id` | `UUID` | нет | — | `—` |
| `code` | `VARCHAR(100)` | нет | — | `—` |
| `name` | `VARCHAR(255)` | нет | — | `—` |
| `position` | `VARCHAR(255)` | да | — | `—` |
| `description` | `TEXT` | нет | — | `''` |
| `endpoint_key` | `VARCHAR(64)` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `endpoint_key ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$'`.
- FK `(profile_id)` → `service_profiles.id`; DELETE `RESTRICT`.
- FK `(target_service_id)` → `services.id`; DELETE `RESTRICT`.
- INDEX `(target_service_id)`.
- UNIQUE `(id, target_service_id)`.
- UNIQUE `(profile_id, code)`.

## `answer_keys`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `scenario_version_id` | `UUID` | нет | да | `—` |
| `expected_card` | `JSONB` | нет | — | `{}` |
| `expected_actions` | `JSONB` | нет | — | `[]` |
| `rubric` | `JSONB` | нет | — | `[]` |
| `explanation` | `TEXT` | нет | — | `''` |

- FK `(scenario_version_id)` → `scenario_versions.id`; DELETE `RESTRICT`.

## `assignments`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `lesson_id` | `UUID` | нет | — | `—` |
| `student_id` | `UUID` | нет | — | `—` |
| `scenario_version_id` | `UUID` | нет | — | `—` |
| `scenario_card_id` | `UUID` | да | — | `—` |
| `position` | `INTEGER` | нет | — | `—` |
| `mode` | `VARCHAR(12)` | нет | — | `—` |
| `time_limit_seconds` | `INTEGER` | да | — | `—` |
| `hint_delay_seconds` | `INTEGER` | да | — | `—` |
| `settings` | `JSONB` | нет | — | `{}` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- CHECK `assignments.mode IN ('introduction', 'practice', 'assessment')`.
- FK `(scenario_card_id, scenario_version_id)` → `scenario_cards.id, scenario_cards.scenario_version_id`; DELETE `RESTRICT`.
- INDEX `(scenario_card_id)`.
- CHECK `hint_delay_seconds IS NULL OR hint_delay_seconds > 0`.
- CHECK `time_limit_seconds IS NULL OR time_limit_seconds > 0`.
- FK `(lesson_id)` → `lessons.id`; DELETE `RESTRICT`.
- FK `(scenario_version_id)` → `scenario_versions.id`; DELETE `RESTRICT`.
- FK `(student_id)` → `users.id`; DELETE `RESTRICT`.
- INDEX `(lesson_id)`.
- INDEX `(scenario_version_id)`.
- INDEX `(student_id)`.
- UNIQUE `(id, student_id, scenario_version_id)`.

- CHECK `position > 0`.
- UNIQUE `(lesson_id, student_id, position)`.

`scenario_card_id` допускает NULL для прежних назначений. Новый API всегда заполняет ссылку.

## `card_templates`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `created_by_id` | `UUID` | нет | — | `—` |
| `title` | `VARCHAR(255)` | нет | — | `—` |
| `classifier_version_id` | `UUID` | нет | — | `—` |
| `classifier_entry_id` | `UUID` | нет | — | `—` |
| `caller_message` | `TEXT` | да | — | `—` |
| `instructions` | `TEXT` | нет | — | `''` |
| `data` | `JSONB` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- FK `(created_by_id)` → `users.id`; DELETE `RESTRICT`.
- FK `(classifier_version_id)` → `classifier_versions.id`; DELETE `RESTRICT`.
- FK `(classifier_entry_id, classifier_version_id)` → `classifier_entries.id, classifier_entries.classifier_version_id`; DELETE `RESTRICT`.
- INDEX `(created_by_id)`, `(classifier_version_id)`, `(classifier_entry_id)`.

## `card_template_recipients`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `card_template_id` | `UUID` | нет | да | `—` |
| `service_id` | `UUID` | нет | да | `—` |

- FK `(card_template_id)` → `card_templates.id`; DELETE `RESTRICT`.
- FK `(service_id)` → `services.id`; DELETE `RESTRICT`.
- INDEX `(service_id)`.

## `scenario_cards`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `scenario_version_id` | `UUID` | нет | — | `—` |
| `card_template_id` | `UUID` | нет | — | `—` |
| `position` | `INTEGER` | нет | — | `—` |
| `snapshot` | `JSONB` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `position > 0`.
- UNIQUE `(scenario_version_id, position)` и `(id, scenario_version_id)`.
- FK `(scenario_version_id)` → `scenario_versions.id`; DELETE `RESTRICT`.
- FK `(card_template_id)` → `card_templates.id`; DELETE `RESTRICT`.
- INDEX `(card_template_id)`.

Снимок содержит `title`, `instructions`, `caller_message`, `data`, `classifier_version_id`,
`classifier_entry_id`, `recipients` (идентификаторы и имена служб). Для оператора 112
`data` — скрытый образец, для ДДС — исходная готовая карточка.

## `classifier_routes`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `entry_id` | `UUID` | нет | — | `—` |
| `service_id` | `UUID` | нет | — | `—` |
| `service_name` | `VARCHAR(255)` | нет | — | `—` |
| `is_main` | `BOOLEAN` | нет | — | `false` |
| `conditions` | `JSONB` | нет | — | `{}` |
| `id` | `UUID` | нет | да | `—` |

- FK `(entry_id)` → `classifier_entries.id`; DELETE `RESTRICT`.
- FK `(service_id)` → `services.id`; DELETE `RESTRICT`.
- INDEX `(service_id)`.
- UNIQUE `(entry_id, service_id)`.

## `service_objects`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `profile_id` | `UUID` | нет | — | `—` |
| `territory_id` | `UUID` | да | — | `—` |
| `code` | `VARCHAR(100)` | нет | — | `—` |
| `name` | `VARCHAR(255)` | нет | — | `—` |
| `address` | `TEXT` | нет | — | `—` |
| `responsibility` | `TEXT` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |

- FK `(profile_id)` → `service_profiles.id`; DELETE `RESTRICT`.
- FK `(territory_id, profile_id)` → `service_territories.id, service_territories.profile_id`; DELETE `RESTRICT`.
- INDEX `(territory_id)`.
- UNIQUE `(profile_id, code)`.

## `attempts`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `assignment_id` | `UUID` | нет | — | `—` |
| `student_id` | `UUID` | нет | — | `—` |
| `scenario_version_id` | `UUID` | нет | — | `—` |
| `number` | `INTEGER` | нет | — | `—` |
| `mode` | `VARCHAR(12)` | нет | — | `—` |
| `settings_snapshot` | `JSONB` | нет | — | `—` |
| `status` | `VARCHAR(11)` | нет | — | `—` |
| `started_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |
| `ended_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `end_reason` | `TEXT` | да | — | `—` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `(status = 'in_progress' AND ended_at IS NULL) OR (status != 'in_progress' AND ended_at IS NOT NULL)`.
- CHECK `attempts.mode IN ('introduction', 'practice', 'assessment')`.
- CHECK `attempts.status IN ('in_progress', 'completed', 'interrupted')`.
- CHECK `ended_at IS NULL OR ended_at >= started_at`.
- CHECK `number > 0`.
- FK `(assignment_id, student_id, scenario_version_id)` → `assignments.id, assignments.student_id, assignments.scenario_version_id`; DELETE `RESTRICT`.
- FK `(scenario_version_id)` → `scenario_versions.id`; DELETE `RESTRICT`.
- FK `(student_id)` → `users.id`; DELETE `RESTRICT`.
- INDEX `(scenario_version_id)`.
- INDEX `(student_id, started_at)`.
- UNIQUE `(assignment_id, number)`.

## `ai_jobs`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `purpose` | `VARCHAR(10)` | нет | — | `—` |
| `scenario_version_id` | `UUID` | да | — | `—` |
| `attempt_id` | `UUID` | да | — | `—` |
| `idempotency_key` | `UUID` | нет | — | `—` |
| `status` | `VARCHAR(9)` | нет | — | `—` |
| `retry_count` | `INTEGER` | нет | — | `0` |
| `available_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |
| `worker_id` | `VARCHAR(100)` | да | — | `—` |
| `lease_expires_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `model_version` | `VARCHAR(255)` | да | — | `—` |
| `prompt_version` | `VARCHAR(100)` | нет | — | `—` |
| `input` | `JSONB` | нет | — | `—` |
| `context` | `JSONB` | нет | — | `{}` |
| `output` | `JSONB` | да | — | `—` |
| `error` | `TEXT` | да | — | `—` |
| `completed_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- CHECK `ai_jobs.purpose IN ('generation', 'evaluation')`.
- CHECK `ai_jobs.status IN ('queued', 'running', 'succeeded', 'failed')`.
- CHECK `purpose != 'evaluation' OR attempt_id IS NOT NULL`.
- CHECK `retry_count >= 0`.
- CHECK `status != 'running' OR (worker_id IS NOT NULL AND lease_expires_at IS NOT NULL)`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- FK `(scenario_version_id)` → `scenario_versions.id`; DELETE `RESTRICT`.
- INDEX `(attempt_id)`.
- INDEX `(scenario_version_id)`.
- INDEX `(status, available_at)`.
- UNIQUE `(id, attempt_id)`.
- UNIQUE `(idempotency_key)`.

## `attempt_events`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `attempt_id` | `UUID` | нет | — | `—` |
| `sequence` | `INTEGER` | нет | — | `—` |
| `command_id` | `UUID` | да | — | `—` |
| `kind` | `VARCHAR(100)` | нет | — | `—` |
| `actor` | `VARCHAR(10)` | нет | — | `—` |
| `actor_id` | `UUID` | да | — | `—` |
| `occurred_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |
| `client_occurred_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `payload` | `JSONB` | нет | — | `{}` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `(actor IN ('student', 'teacher') AND actor_id IS NOT NULL) OR (actor IN ('system', 'simulation') AND actor_id IS NULL)`.
- CHECK `attempt_events.actor IN ('student', 'teacher', 'simulation', 'system')`.
- CHECK `sequence > 0`.
- FK `(actor_id)` → `users.id`; DELETE `RESTRICT`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- UNIQUE `(attempt_id, command_id)`.
- UNIQUE `(attempt_id, sequence)`.
- UNIQUE `(id, attempt_id)`.

## `incident_cards`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `attempt_id` | `UUID` | нет | — | `—` |
| `origin` | `VARCHAR(8)` | нет | — | `—` |
| `source_card_id` | `UUID` | да | — | `—` |
| `created_by_id` | `UUID` | да | — | `—` |
| `display_number` | `VARCHAR(50)` | да | — | `—` |
| `status` | `VARCHAR(10)` | нет | — | `—` |
| `classifier_version_id` | `UUID` | нет | — | `—` |
| `classifier_entry_id` | `UUID` | да | — | `—` |
| `source` | `VARCHAR(255)` | да | — | `—` |
| `caller_name` | `VARCHAR(255)` | да | — | `—` |
| `caller_phone` | `VARCHAR(100)` | да | — | `—` |
| `caller_details` | `JSONB` | да | — | `—` |
| `address_text` | `TEXT` | да | — | `—` |
| `address_details` | `JSONB` | да | — | `—` |
| `description` | `TEXT` | да | — | `—` |
| `victim_details` | `TEXT` | да | — | `—` |
| `features` | `JSONB` | да | — | `—` |
| `additional_fields` | `JSONB` | нет | — | `{}` |
| `opened_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `saved_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `notification_completed_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `revision` | `INTEGER` | нет | — | `1` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- CHECK `incident_cards.origin IN ('student', 'prepared', 'copied')`.
- CHECK `incident_cards.status IN ('draft', 'registered', 'notified', 'completed')`.
- CHECK `notification_completed_at IS NULL OR (saved_at IS NOT NULL AND notification_completed_at >= saved_at)`.
- CHECK `origin != 'copied' OR source_card_id IS NOT NULL`.
- CHECK `revision > 0`.
- CHECK `saved_at IS NULL OR (opened_at IS NOT NULL AND saved_at >= opened_at)`.
- CHECK `source_card_id IS NULL OR source_card_id != id`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- FK `(classifier_entry_id, classifier_version_id)` → `classifier_entries.id, classifier_entries.classifier_version_id`; DELETE `RESTRICT`.
- FK `(classifier_version_id)` → `classifier_versions.id`; DELETE `RESTRICT`.
- FK `(created_by_id)` → `users.id`; DELETE `RESTRICT`.
- FK `(source_card_id)` → `incident_cards.id`; DELETE `RESTRICT`.
- INDEX `(classifier_entry_id)`.
- INDEX `(classifier_version_id)`.
- INDEX `(source_card_id)`.
- UNIQUE `(attempt_id)`.
- UNIQUE `(id, attempt_id)`.

## `evaluations`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `attempt_id` | `UUID` | нет | — | `—` |
| `revision` | `INTEGER` | нет | — | `—` |
| `method` | `VARCHAR(7)` | нет | — | `—` |
| `status` | `VARCHAR(12)` | нет | — | `—` |
| `supersedes_id` | `UUID` | да | — | `—` |
| `ai_job_id` | `UUID` | да | — | `—` |
| `reviewer_id` | `UUID` | да | — | `—` |
| `review_reason` | `TEXT` | да | — | `—` |
| `score` | `NUMERIC(10, 2)` | да | — | `—` |
| `max_score` | `NUMERIC(10, 2)` | да | — | `—` |
| `summary` | `TEXT` | да | — | `—` |
| `completed_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `id` | `UUID` | нет | да | `—` |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |

- CHECK `(score IS NULL OR score >= 0) AND (max_score IS NULL OR max_score > 0) AND (score IS NULL OR (max_score IS NOT NULL AND score <= max_score))`.
- CHECK `evaluations.method IN ('rules', 'ai', 'teacher')`.
- CHECK `evaluations.status IN ('pending', 'completed', 'needs_review', 'failed')`.
- CHECK `method != 'ai' OR ai_job_id IS NOT NULL`.
- CHECK `method != 'teacher' OR (reviewer_id IS NOT NULL AND review_reason IS NOT NULL AND length(btrim(review_reason)) > 0)`.
- CHECK `revision > 0`.
- CHECK `supersedes_id IS NULL OR supersedes_id != id`.
- FK `(ai_job_id, attempt_id)` → `ai_jobs.id, ai_jobs.attempt_id`; DELETE `RESTRICT`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- FK `(reviewer_id)` → `users.id`; DELETE `RESTRICT`.
- FK `(supersedes_id, attempt_id)` → `evaluations.id, evaluations.attempt_id`; DELETE `RESTRICT`.
- INDEX `(ai_job_id)`.
- INDEX `(supersedes_id)`.
- UNIQUE `(attempt_id, revision)`.
- UNIQUE `(id, attempt_id)`.

## `service_responses`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `card_id` | `UUID` | нет | — | `—` |
| `attempt_id` | `UUID` | нет | — | `—` |
| `service_id` | `UUID` | нет | — | `—` |
| `service_name` | `VARCHAR(255)` | нет | — | `—` |
| `status` | `VARCHAR(12)` | нет | — | `—` |
| `added_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |
| `sent_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `received_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `first_decision_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `crew_number` | `VARCHAR(100)` | да | — | `—` |
| `comment` | `TEXT` | нет | — | `''` |
| `revision` | `INTEGER` | нет | — | `1` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `first_decision_at IS NULL OR (sent_at IS NOT NULL AND first_decision_at >= sent_at)`.
- CHECK `received_at IS NULL OR (sent_at IS NOT NULL AND received_at >= sent_at)`.
- CHECK `revision > 0`.
- CHECK `sent_at IS NULL OR sent_at >= added_at`.
- CHECK `service_responses.status IN ('added', 'received', 'accepted', 'not_accepted', 'responding', 'arrived', 'in_progress', 'completed', 'refused')`.
- CHECK `status NOT IN ('not_accepted', 'refused') OR length(btrim(comment)) > 0`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- FK `(card_id, attempt_id)` → `incident_cards.id, incident_cards.attempt_id`; DELETE `RESTRICT`.
- FK `(service_id)` → `services.id`; DELETE `RESTRICT`.
- INDEX `(attempt_id)`.
- INDEX `(service_id)`.
- UNIQUE `(card_id, service_id)`.
- UNIQUE `(id, attempt_id)`.

## `criterion_results`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `evaluation_id` | `UUID` | нет | — | `—` |
| `attempt_id` | `UUID` | нет | — | `—` |
| `code` | `VARCHAR(100)` | нет | — | `—` |
| `criterion_snapshot` | `JSONB` | нет | — | `—` |
| `score` | `NUMERIC(10, 2)` | да | — | `—` |
| `max_score` | `NUMERIC(10, 2)` | нет | — | `—` |
| `explanation` | `TEXT` | нет | — | `—` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `(score IS NULL OR score >= 0) AND max_score > 0 AND (score IS NULL OR score <= max_score)`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- FK `(evaluation_id, attempt_id)` → `evaluations.id, evaluations.attempt_id`; DELETE `RESTRICT`.
- INDEX `(attempt_id)`.
- UNIQUE `(evaluation_id, code)`.
- UNIQUE `(id, attempt_id)`.

## `response_events`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `response_id` | `UUID` | нет | — | `—` |
| `attempt_id` | `UUID` | нет | — | `—` |
| `attempt_event_id` | `UUID` | нет | — | `—` |
| `information_event_id` | `UUID` | да | — | `—` |
| `status` | `VARCHAR(12)` | нет | — | `—` |
| `crew_number` | `VARCHAR(100)` | да | — | `—` |
| `comment` | `TEXT` | нет | — | `''` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `response_events.status IN ('added', 'received', 'accepted', 'not_accepted', 'responding', 'arrived', 'in_progress', 'completed', 'refused')`.
- CHECK `status NOT IN ('not_accepted', 'refused') OR length(btrim(comment)) > 0`.
- FK `(attempt_event_id, attempt_id)` → `attempt_events.id, attempt_events.attempt_id`; DELETE `RESTRICT`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- FK `(information_event_id, attempt_id)` → `attempt_events.id, attempt_events.attempt_id`; DELETE `RESTRICT`.
- FK `(response_id, attempt_id)` → `service_responses.id, service_responses.attempt_id`; DELETE `RESTRICT`.
- INDEX `(attempt_id)`.
- INDEX `(information_event_id)`.
- INDEX `(response_id)`.
- UNIQUE `(attempt_event_id)`.

## `training_calls`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `attempt_id` | `UUID` | нет | — | `—` |
| `response_id` | `UUID` | нет | — | `—` |
| `command_id` | `UUID` | нет | — | `—` |
| `initiated_by_id` | `UUID` | нет | — | `—` |
| `contact_id` | `UUID` | нет | — | `—` |
| `target_service_id` | `UUID` | нет | — | `—` |
| `contact_name` | `VARCHAR(255)` | нет | — | `—` |
| `target_service_name` | `VARCHAR(255)` | нет | — | `—` |
| `endpoint_key` | `VARCHAR(64)` | нет | — | `—` |
| `status` | `VARCHAR(9)` | нет | — | `—` |
| `provider_call_id` | `VARCHAR(255)` | да | — | `—` |
| `started_at` | `TIMESTAMP WITH TIME ZONE` | нет | — | `now()` |
| `connected_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `ended_at` | `TIMESTAMP WITH TIME ZONE` | да | — | `—` |
| `result` | `TEXT` | да | — | `—` |
| `recording_key` | `TEXT` | да | — | `—` |
| `id` | `UUID` | нет | да | `—` |

- CHECK `connected_at IS NULL OR connected_at >= started_at`.
- CHECK `ended_at IS NULL OR (ended_at >= started_at AND (connected_at IS NULL OR ended_at >= connected_at))`.
- CHECK `endpoint_key ~ '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$'`.
- CHECK `training_calls.status IN ('dialing', 'connected', 'ended', 'busy', 'no_answer', 'failed')`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- FK `(contact_id, target_service_id)` → `training_contacts.id, training_contacts.target_service_id`; DELETE `RESTRICT`.
- FK `(initiated_by_id)` → `users.id`; DELETE `RESTRICT`.
- FK `(response_id, attempt_id)` → `service_responses.id, service_responses.attempt_id`; DELETE `RESTRICT`.
- FK `(target_service_id)` → `services.id`; DELETE `RESTRICT`.
- INDEX `(contact_id)`.
- INDEX `(response_id)`.
- INDEX `(target_service_id)`.
- UNIQUE `(attempt_id, command_id)`.
- UNIQUE `(provider_call_id)`.

## `criterion_evidence`

| Колонка | Тип PostgreSQL | NULL | PK | SQL default |
| --- | --- | --- | --- | --- |
| `criterion_result_id` | `UUID` | нет | да | `—` |
| `attempt_event_id` | `UUID` | нет | да | `—` |
| `attempt_id` | `UUID` | нет | — | `—` |

- FK `(attempt_event_id, attempt_id)` → `attempt_events.id, attempt_events.attempt_id`; DELETE `RESTRICT`.
- FK `(attempt_id)` → `attempts.id`; DELETE `RESTRICT`.
- FK `(criterion_result_id, attempt_id)` → `criterion_results.id, criterion_results.attempt_id`; DELETE `RESTRICT`.
- INDEX `(attempt_event_id)`.
- INDEX `(attempt_id)`.

Миграция `0009_catalog_revision`: revision в ЕКП и профилях защищает правки черновиков от устаревших запросов. Публикация также увеличивает revision. См. [CATALOG_AND_DDS.md](CATALOG_AND_DDS.md).
