/**
 * What uses this master data record.
 *
 * Reached by tapping a row in Master data. The list there says "used by 12
 * assets", and twelve is the answer to a question nobody asks — "which twelve"
 * is the one people have, and before deactivating or renaming something it is
 * the only one that matters.
 *
 * Three sections, and each only appears when it has anything in it. A category
 * has assets and maybe accessories; a company has only people; a unit has only
 * the assets fitted to it. Printing an empty "People" heading under every
 * category would train people to stop reading the headings.
 *
 * Every row leads somewhere: an asset to its detail, an accessory to its stock,
 * a person to their record. A dead-end list would answer "which twelve" and
 * then leave you to go and find them yourself.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { useTheme } from '@/theme';
import { Badge, Card, EmptyState, Screen, Skeleton } from '@/components/ui';
import { fetchMasterUsage, labelFor, type MasterEntity } from '@/api/masterData';

export default function MasterUsageScreen() {
  const t = useTheme();
  const router = useRouter();
  const { entity, id, name } = useLocalSearchParams<{
    entity: MasterEntity;
    id: string;
    name?: string;
  }>();

  const usage = useQuery({
    queryKey: ['masterUsage', entity, id],
    queryFn: () => fetchMasterUsage(entity, id),
    enabled: Boolean(entity && id),
  });

  const assets = usage.data?.assets ?? [];
  const accessories = usage.data?.accessories ?? [];
  const people = usage.data?.people ?? [];
  const nothing = assets.length === 0 && accessories.length === 0 && people.length === 0;

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back to Master data"
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeft size={15} color={t.color.royal} strokeWidth={2} />
        <Text style={[t.type.metaStrong, { color: t.color.royal }]}>Master data</Text>
      </Pressable>

      <Text style={[t.type.screenTitle, { color: t.color.text }]}>
        {name ?? 'Where it is used'}
      </Text>
      <Text style={[t.type.meta, styles.subtitle, { color: t.color.sub }]}>
        {entity ? labelFor(entity) : ''}
        {usage.data ? ` · ${assets.length} asset${assets.length === 1 ? '' : 's'}` : ''}
        {accessories.length > 0 ? ` · ${accessories.length} accessories` : ''}
        {people.length > 0 ? ` · ${people.length} people` : ''}
      </Text>

      {usage.isPending ? (
        <View style={styles.list}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={68} radius={t.radii.card} />
          ))}
        </View>
      ) : usage.isError ? (
        <EmptyState
          variant="error"
          title="Could not load this"
          description={(usage.error as Error).message}
          actionLabel="Try again"
          onAction={() => usage.refetch()}
        />
      ) : nothing ? (
        <EmptyState
          title="Nothing uses this yet"
          description="Which is why it can still be deleted. Once something references it, only deactivating is possible."
        />
      ) : (
        <>
          {assets.length > 0 ? (
            <>
              <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                Assets
              </Text>
              <View style={styles.list}>
                {assets.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/asset/${a.assetCode}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.assetCode} ${a.name}`}
                  >
                    <Card padding={13}>
                      <View style={styles.row}>
                        <View style={styles.rowText}>
                          <Text style={[t.type.assetCode, { color: t.color.royal }]}>
                            {a.assetCode}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[t.type.body, { color: t.color.text, marginTop: 2 }]}
                          >
                            {a.name}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[t.type.metaStrong, { color: t.color.sub, marginTop: 2 }]}
                          >
                            {[
                              a.holderName ?? (a.unitCode ? `Unit ${a.unitCode}` : 'Unassigned'),
                              a.locationName,
                            ].join(' · ')}
                          </Text>
                        </View>
                        <Badge label={a.statusName} />
                        <ChevronRight size={18} color={t.color.sub} strokeWidth={1.7} />
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {accessories.length > 0 ? (
            <>
              <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                Accessories
              </Text>
              <View style={styles.list}>
                {accessories.map((x) => (
                  <Pressable
                    key={x.id}
                    onPress={() => router.push(`/accessory/${x.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={x.name}
                  >
                    <Card padding={13}>
                      <View style={styles.row}>
                        <View style={styles.rowText}>
                          <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                            {x.name}
                          </Text>
                          <Text style={[t.type.metaStrong, { color: t.color.sub, marginTop: 3 }]}>
                            {x.locationName}
                          </Text>
                        </View>
                        <View style={styles.stock}>
                          <Text style={[t.type.assetCode, { color: t.color.royal }]}>
                            {x.availableQty}
                          </Text>
                          <Text style={[t.type.badge, { color: t.color.sub }]}>
                            of {x.totalQty}
                          </Text>
                        </View>
                        <ChevronRight size={18} color={t.color.sub} strokeWidth={1.7} />
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {people.length > 0 ? (
            <>
              <Text style={[t.type.sectionLabel, styles.sectionLabel, { color: t.color.sub }]}>
                People
              </Text>
              <View style={styles.list}>
                {people.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push(`/account-edit?id=${p.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={p.fullName}
                  >
                    <Card padding={13}>
                      <View style={styles.row}>
                        <View style={styles.rowText}>
                          <Text numberOfLines={1} style={[t.type.body, { color: t.color.text }]}>
                            {p.fullName}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[t.type.metaStrong, { color: t.color.sub, marginTop: 3 }]}
                          >
                            {[p.jobTitle, p.departmentName, p.nik].filter(Boolean).join(' · ') ||
                              'No details recorded'}
                          </Text>
                        </View>
                        {!p.isActive ? <Badge label="Inactive" tone="retired" /> : null}
                        {p.isActive && !p.canLogin ? <Badge label="No login" /> : null}
                        <ChevronRight size={18} color={t.color.sub} strokeWidth={1.7} />
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12, minHeight: 24 },
  subtitle: { marginTop: 5, marginBottom: 4 },
  sectionLabel: { marginTop: 18, marginBottom: 9, marginLeft: 2 },
  list: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1, minWidth: 0 },
  stock: { alignItems: 'flex-end' },
});
