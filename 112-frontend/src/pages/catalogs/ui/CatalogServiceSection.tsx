import { catalogApi, type Service } from "@/entities/catalog";
import { ServiceDialog } from "@/features/catalog-management";
import { rowAction } from "@/shared/lib/rowAction";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { CatalogServiceSectionProps } from "../types/CatalogSections";

export function CatalogServiceSection({
  onChanged,
}: CatalogServiceSectionProps) {
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Service | null | undefined>();
  const services = useQuery({
    queryKey: ["admin-services", page],
    queryFn: ({ signal }) => catalogApi.services({ offset: page * 20 }, signal),
  });
  const refresh = () => {
    for (const key of ["admin-services", "admin-service-options", "services"]) {
      void client.invalidateQueries({ queryKey: [key] });
    }
    onChanged();
  };
  return (
    <>
      <Typography variant="h6" component="h2">
        Службы
      </Typography>
      <Button onClick={() => setSelected(null)}>Создать службу</Button>
      <QueryState
        pending={services.isPending}
        error={services.error}
        retry={() => void services.refetch()}
      >
        {services.data && (
          <>
            <TableContainer>
              <Table aria-label="Службы">
                <TableHead>
                  <TableRow>
                    <TableCell>Код</TableCell>
                    <TableCell>Название</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {services.data.items.map((service) => (
                    <TableRow
                      key={service.id}
                      {...rowAction(() => setSelected(service))}
                    >
                      <TableCell>{service.code}</TableCell>
                      <TableCell>
                        <Button
                          className="table-block-link"
                          onClick={() => setSelected(service)}
                        >
                          {service.short_name
                            ? `${service.short_name} — ${service.name}`
                            : service.name}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <PageControls
              total={services.data.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
      {selected !== undefined && (
        <ServiceDialog
          service={selected ?? undefined}
          onClose={() => setSelected(undefined)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
