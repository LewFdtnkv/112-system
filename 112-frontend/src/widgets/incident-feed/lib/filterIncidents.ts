import {
  formatAddress,
  getCategoryName,
  incidentStatusLabels,
  type IncidentCard,
} from "@/entities/incident-card";
import type { IncidentFeedFilters } from "../types/IncidentFeedFilters";
const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").trim();
const sortKey = (card: IncidentCard) =>
  `${card.createdDate?.split(".").reverse().join("-") ?? ""} ${card.createdAt}`;
export const filterIncidents = (
  incidents: readonly IncidentCard[],
  filters: IncidentFeedFilters,
  status: string,
  notifications: boolean,
  descending: boolean,
) =>
  [...incidents]
    .filter((incident) => {
      const { fields } = incident;
      const address = formatAddress(fields.address);
      const text = [
        incident.id,
        incident.categoryName ?? getCategoryName(fields.categoryId),
        address,
        fields.description,
        fields.callerName,
        ...Object.values(fields.phones),
      ].join(" ");
      return (
        (!filters.query ||
          normalize(text).includes(normalize(filters.query))) &&
        (!filters.address ||
          normalize(address).includes(normalize(filters.address))) &&
        (!filters.district ||
          normalize(fields.address.district).includes(
            normalize(filters.district),
          )) &&
        (!filters.status ||
          normalize(incidentStatusLabels[fields.status]).includes(
            normalize(filters.status),
          )) &&
        (!status || fields.status === status) &&
        (!notifications || fields.status === "not_notified")
      );
    })
    .sort(
      (a, b) => (descending ? -1 : 1) * sortKey(a).localeCompare(sortKey(b)),
    );
