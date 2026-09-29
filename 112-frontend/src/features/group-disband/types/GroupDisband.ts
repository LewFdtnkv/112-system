export interface GroupDisbandProps {
  group: { id: string; name: string };
  onDisbanded?: () => void;
}
