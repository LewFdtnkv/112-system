import type {
  GenerationOptions,
  GenerationParameters,
} from "@/entities/training";

const normalize = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е");

export function addressChoices(
  data: GenerationOptions,
  parameters: GenerationParameters,
) {
  const local = data.addresses.filter(
    (a) =>
      !parameters.locality ||
      normalize(a.locality) === normalize(parameters.locality),
  );
  const street = local.filter(
    (a) =>
      !parameters.street ||
      normalize(a.street) === normalize(parameters.street),
  );
  const unique = (values: string[]) =>
    [...new Set(values)].sort((a, b) =>
      a.localeCompare(b, "ru", { numeric: true }),
    );
  return {
    locality: unique(data.addresses.map((a) => a.locality)),
    street: unique(local.map((a) => a.street)),
    house: unique(street.map((a) => a.house)),
  };
}
