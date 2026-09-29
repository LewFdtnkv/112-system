import { userKeys } from "@/entities/user";
import {
  CatalogFiles,
  CatalogRules,
  ProfilesPanel,
} from "@/features/catalog-management";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Stack } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CatalogClassifierSection } from "./CatalogClassifierSection";
import { CatalogServiceSection } from "./CatalogServiceSection";

export const CatalogsPage = () => {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string>();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: userKeys.statistics });
    void client.invalidateQueries({ queryKey: ["admin-classifiers"] });
    void client.invalidateQueries({ queryKey: ["classifier-options"] });
  };
  return (
    <Stack spacing={2}>
      <PageHeader title="Службы и классификаторы" />
      <CatalogServiceSection onChanged={refresh} />
      <CatalogFiles
        onImported={() => {
          refresh();
          void client.invalidateQueries({ queryKey: ["admin-services"] });
        }}
      />
      <CatalogClassifierSection onSelect={setSelected} onChanged={refresh} />
      <ProfilesPanel />
      {selected && (
        <CatalogRules
          versionId={selected}
          onClose={() => setSelected(undefined)}
          onChanged={refresh}
        />
      )}
    </Stack>
  );
};
