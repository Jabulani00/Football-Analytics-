import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import FlashscoreTabs from '@/components/shared/FlashscoreTabs';
import PageContainer from '@/components/shared/PageContainer';
import StickyBack from '@/components/shared/StickyBack';
import SectionLabel from '@/components/shared/SectionLabel';
import type { TeamProfile } from '@/mock/teamData';
import { fonts, layout, spacing, theme } from '@/styles/theme';

type TeamScreenProps = {
  team: TeamProfile;
  onBack: () => void;
};

type TeamTabId = 'summary' | 'squad' | 'transfers';

const TABS: { id: TeamTabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'squad', label: 'Squad' },
  { id: 'transfers', label: 'Transfers' },
];

export default function TeamScreen({ team, onBack }: TeamScreenProps) {
  const [activeTab, setActiveTab] = useState<TeamTabId>('summary');

  return (
    <PageContainer noPadding contentContainerStyle={styles.scroll}>
      <StickyBack label="← FIXTURE" onPress={onBack} />

      <View style={styles.header}>
        <Text style={styles.name}>{team.name}</Text>
        <Text style={styles.league}>{team.leagueId.toUpperCase()}</Text>
      </View>

      <FlashscoreTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'summary' ? (
        <View style={styles.panel}>
          <Text style={styles.coach}>Coach: {team.coach}</Text>
          <Text style={styles.meta}>Squad size: {team.squad.length} players</Text>
          <Text style={styles.meta}>
            Transfers: {team.transfersIn.length} in · {team.transfersOut.length} out
          </Text>
        </View>
      ) : null}

      {activeTab === 'squad' ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.h, styles.wide]}>Player</Text>
            <Text style={styles.h}>Pos</Text>
            <Text style={styles.h}>Age</Text>
            <Text style={styles.h}>Nat</Text>
            <Text style={styles.h}>G</Text>
          </View>
          {team.squad.map((p) => (
            <View key={p.name} style={styles.row}>
              <Text style={[styles.cell, styles.wide, styles.player]}>{p.name}</Text>
              <Text style={styles.cell}>{p.position}</Text>
              <Text style={styles.cell}>{p.age}</Text>
              <Text style={styles.cell}>{p.nationality}</Text>
              <Text style={styles.cell}>{p.goals ?? '—'}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activeTab === 'transfers' ? (
        <View style={styles.panel}>
          <SectionLabel>TRANSFERS IN</SectionLabel>
          {team.transfersIn.map((t) => (
            <TransferRow key={t.player + t.from} transfer={t} />
          ))}
          <SectionLabel style={styles.section}>TRANSFERS OUT</SectionLabel>
          {team.transfersOut.map((t) => (
            <TransferRow key={t.player + t.to} transfer={t} />
          ))}
        </View>
      ) : null}
    </PageContainer>
  );
}

function TransferRow({
  transfer,
}: {
  transfer: { player: string; from: string; to: string; fee: string };
}) {
  return (
    <View style={styles.transfer}>
      <Text style={styles.transferPlayer}>{transfer.player}</Text>
      <Text style={styles.transferDetail}>
        {transfer.from} → {transfer.to} · {transfer.fee}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  header: {
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  name: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 20,
    color: theme.textPrimary,
  },
  league: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  panel: {
    gap: spacing.sm,
  },
  coach: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: theme.textMuted,
  },
  section: { marginTop: spacing.lg },
  table: {
    backgroundColor: theme.surface,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    overflow: 'hidden',
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: theme.surfaceMuted,
    padding: spacing.sm,
  },
  h: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
  },
  wide: { flex: 2, textAlign: 'left' },
  row: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  cell: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
  },
  player: {
    color: theme.textPrimary,
    fontFamily: fonts.bodyMedium,
    textAlign: 'left',
  },
  transfer: {
    backgroundColor: theme.surface,
    padding: spacing.md,
    borderRadius: layout.borderRadius,
    borderWidth: layout.borderWidth,
    borderColor: theme.border,
    marginBottom: spacing.sm,
  },
  transferPlayer: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: theme.textPrimary,
  },
  transferDetail: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 4,
  },
});
