import { useWindowDimensions } from 'react-native';

import FilterDropdown from '@/components/shared/FilterDropdown';
import type { LiveCompetition } from '@/hooks/useLiveCompetitions';

type Props = {
  competitions: LiveCompetition[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Shown before a competition is selected, including while the list is empty. */
  emptyLabel?: string;
};

/** Same competition choice as before, shown as a searchable dropdown. */
export default function CompetitionPicker({ competitions, selectedId, onSelect, emptyLabel }: Props) {
  const narrow = useWindowDimensions().width < 720;
  return (
    <FilterDropdown
      label="Competition"
      value={selectedId == null ? '' : String(selectedId)}
      options={competitions.map((comp) => ({
        value: String(comp.id),
        label: comp.country ? `${comp.name} · ${comp.country}` : comp.name,
      }))}
      emptyLabel={emptyLabel}
      onChange={(value) => {
        if (value) onSelect(Number(value));
      }}
      style={narrow ? { width: '100%', minWidth: 0, flexBasis: 'auto', flexGrow: 0 } : { width: '100%', flexBasis: 'auto' }}
    />
  );
}
