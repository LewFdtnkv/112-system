import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { LocationPicker } from "@/shared/ui/location-picker";
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  Link,
  MenuItem,
} from "@mui/material";
import { GenerationTextChoice } from "./GenerationTextChoice";
import type { CardGenerationPanelProps } from "../types/CardGenerationPanels";
import { addressChoices } from "../lib/catalogChoices";
import { useGenerationAddress } from "../model/useGenerationAddress";
export function GenerationAddress({ model }: CardGenerationPanelProps) {
  const data = model.options.data!;
  const addresses = addressChoices(data, model.p);
  const map = useGenerationAddress(model);
  return (
    <>
      <h3>Место происшествия</h3>
      <Button type="button" onClick={() => map.setOpen(true)}>
        Выбрать адрес на карте
      </Button>
      {model.p.location && (
        <p>
          Точка на карте выбрана: {model.p.location.latitude.toFixed(5)},{" "}
          {model.p.location.longitude.toFixed(5)}
        </p>
      )}
      <Dialog
        open={map.open}
        onClose={() => map.setOpen(false)}
        fullWidth
        maxWidth="md"
        aria-labelledby="generation-map-title"
      >
        <DialogTitle id="generation-map-title">
          Адрес происшествия на карте
        </DialogTitle>
        <DialogContent>
          {map.error && <Alert severity="warning">{map.error}</Alert>}
          {map.open && (
            <LocationPicker
              initial={model.p.location ?? null}
              initialAddress={[model.p.locality, model.p.street, model.p.house]
                .filter(Boolean)
                .join(", ")}
              onConfirm={map.confirm}
              onCancel={() => map.setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <p>
        Случайный адрес выбирается целиком из {data.addresses.length} московских
        адресов. Для своего адреса укажите улицу и дом или ориентир. Адресные
        данные:{" "}
        <Link
          href={data.address_source.source_url}
          target="_blank"
          rel="noreferrer"
        >
          {data.address_source.source} ({data.address_source.license})
        </Link>
        .
      </p>
      <TextField
        name="parameters.address_format"
        select
        label="Формат адреса"
        value={model.p.address_format ?? "random"}
        onChange={(e) =>
          model.change({
            address_format:
              e.target.value === "random"
                ? null
                : (e.target.value as "structured" | "descriptive"),
          })
        }
      >
        <MenuItem value="random">Случайно</MenuItem>
        {data.address_format.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <div className="generation-grid">
        <GenerationTextChoice
          model={model}
          name="locality"
          label="Населённый пункт"
          values={addresses.locality}
        />
        <GenerationTextChoice
          model={model}
          name="street"
          label="Улица"
          values={addresses.street}
        />
        <GenerationTextChoice
          model={model}
          name="house"
          label="Дом"
          values={addresses.house}
        />
        {(
          [
            ["building", "Корпус"],
            ["structure", "Строение"],
          ] as const
        ).map(([key, label]) => (
          <TextField
            key={key}
            name={`parameters.${key}`}
            label={label}
            value={model.p[key] ?? ""}
            disabled={!model.p.house}
            slotProps={{ htmlInput: { maxLength: 200 } }}
            onChange={(event) =>
              model.change({ [key]: event.target.value || null })
            }
          />
        ))}
        <GenerationTextChoice
          model={model}
          name="object"
          label="Объект"
          values={data.object}
        />
      </div>
      <TextField
        name="parameters.address_description"
        label="Описательный адрес — ориентиры"
        multiline
        minRows={2}
        value={model.p.address_description ?? ""}
        disabled={model.p.address_format === "structured" || !!model.p.house}
        placeholder="Случайный ориентир из заготовок"
        helperText="Например: за остановкой, рядом с зелёным ограждением. Номер дома не выдумывается."
        onChange={(e) =>
          model.change({ address_description: e.target.value || null })
        }
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
    </>
  );
}
