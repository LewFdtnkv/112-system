import { Button } from "@mui/material";
import { CardDataFields, type FeatureDefinition } from "@/entities/training";
import type { CardDetailsProps } from "../types/CardSections";
import { CardRoleSection, CardSections } from "./CardSections";
import { CardDDSDetails } from "./CardDDSDetails";

export function CardDetails({ card, onPreview }: CardDetailsProps) {
  return (
    <CardSections>
      <CardRoleSection kind="common">
        <h4>{card.title}</h4>
        <div>
          <h4>Общая инструкция ученику</h4>
          <p>{card.instructions || "Дополнительных указаний нет"}</p>
          <small>Показывается ученику в обоих режимах.</small>
        </div>
        <section className="template-solution" aria-label="Эталонное решение">
          <div className="template-solution-heading">
            <h4>Эталонное решение 112 / входящая карточка ДДС</h4>
            <Button onClick={onPreview}>Открыть в АРМ</Button>
          </div>
          <p className="template-explanation">
            Оператор 112 заполняет эти поля самостоятельно. Другая формулировка
            может быть корректной; смысл проверяется отдельно. Оператор ДДС
            получает эти сведения уже заполненными.
          </p>
          <div className="template-routing">
            <b>Тип происшествия</b>
            <p>
              {card.classifier_entry?.display_name ||
                card.classifier_entry?.name ||
                "Тип не установлен"}
            </p>
            <b>Службы — получатели карточки</b>
            <ul>
              {card.recipients?.length ? (
                card.recipients.map((service) => (
                  <li key={service.service_id}>
                    {service.short_name && (
                      <strong>{service.short_name} · </strong>
                    )}
                    {service.name}
                  </li>
                ))
              ) : (
                <li>Без оповещения служб</li>
              )}
            </ul>
          </div>
          <CardDataFields
            data={card.data}
            features={
              card.classifier_entry?.conditions.features as
                FeatureDefinition[] | undefined
            }
          />
        </section>
      </CardRoleSection>
      <CardRoleSection kind="operator_112">
        <h4>Сообщение заявителя для оператора 112</h4>
        <p>
          {card.caller_message ||
            "Сообщение не задано. Для сценария оператора 112 его нужно заполнить."}
        </p>
      </CardRoleSection>
      <CardRoleSection kind="dds">
        <CardDDSDetails card={card} />
      </CardRoleSection>
    </CardSections>
  );
}
