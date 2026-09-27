export interface RouteAddressFieldsProps {
  name: string;
  editable: boolean;
  value: Record<string, string>[];
  onChange: (value: Record<string, string>[]) => void;
}
