import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { paginate, passwordChecks, type Page } from '@saanpaw/shared';
import { theme } from '@/constants/theme';

/* ----------------------------------------------------------- password rules */

/**
 * Live checklist under a new-password field: each rule turns green as it is met, so people know
 * what is still missing before they submit. The server enforces the same three rules.
 */
export function PasswordRules({ password }: { password: string }) {
  const checks = passwordChecks(password);
  const allMet = checks.every((c) => c.met);
  return (
    <View style={styles.rules} accessibilityLabel="Password requirements">
      {checks.map((c) => (
        <View key={c.label} style={styles.ruleRow}>
          <Ionicons
            name={c.met ? 'checkmark-circle' : 'ellipse-outline'}
            size={15}
            color={c.met ? theme.colors.primary : theme.colors.muted}
          />
          <Text style={[styles.ruleText, c.met && { color: theme.colors.primaryDark }]}>{c.label}</Text>
        </View>
      ))}
      {password.length > 0 && allMet ? (
        <Text style={[styles.ruleText, { color: theme.colors.primaryDark, fontFamily: theme.fonts.bold }]}>
          Strong password - all requirements met.
        </Text>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- pagination */

export const PAGE_SIZE = 8;

/** Page state for a list; resets to page 1 whenever `resetKey` (a filter or tab) changes. */
export function usePagination<T>(items: T[], pageSize = PAGE_SIZE, resetKey?: unknown): Page<T> & { setPage: (p: number) => void } {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  return { ...paginate(items, page, pageSize), setPage };
}

/** Previous / "Page 2 of 5" / Next. Hidden when everything fits on one page. */
export function Pager({ page, pageCount, total, from, to, setPage }: Page<unknown> & { setPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <View style={styles.pager}>
      <PagerButton icon="chevron-back" label="Previous" disabled={page === 1} onPress={() => setPage(page - 1)} />
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={styles.pagerTitle}>
          Page {page} of {pageCount}
        </Text>
        <Text style={styles.pagerSub}>
          {from}-{to} of {total}
        </Text>
      </View>
      <PagerButton icon="chevron-forward" label="Next" disabled={page === pageCount} onPress={() => setPage(page + 1)} right />
    </View>
  );
}

function PagerButton({
  icon,
  label,
  disabled,
  onPress,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
  right?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} page`}
      style={({ pressed }) => [styles.pagerBtn, disabled && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}
    >
      {right ? <Text style={styles.pagerBtnText}>{label}</Text> : null}
      <Ionicons name={icon} size={16} color={theme.colors.primary} />
      {right ? null : <Text style={styles.pagerBtnText}>{label}</Text>}
    </Pressable>
  );
}

/* ------------------------------------------------------------------- charts */

export interface ChartSeries {
  label: string;
  color: string;
  values: number[];
}

/**
 * Grouped vertical bars built from Views (no chart library), so it renders the same on Android,
 * iOS and web. Each bar shows its value above it, so nothing needs a tooltip.
 */
export function BarChart({ categories, series, height = 130 }: { categories: string[]; series: ChartSeries[]; height?: number }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  return (
    <View>
      <View style={[styles.chartArea, { height: height + 18 }]}>
        {categories.map((c, ci) => (
          <View key={c + ci} style={styles.chartGroup}>
            <View style={[styles.chartBars, { height: height + 18 }]}>
              {series.map((s) => {
                const v = s.values[ci] ?? 0;
                return (
                  <View key={s.label} style={styles.chartBarCol}>
                    <Text style={styles.chartValue}>{v > 0 ? v : ''}</Text>
                    <View
                      style={{
                        width: '100%',
                        height: Math.max(v > 0 ? 3 : 0, (v / max) * height),
                        backgroundColor: s.color,
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                      }}
                    />
                  </View>
                );
              })}
            </View>
            <Text style={styles.chartLabel}>{c}</Text>
          </View>
        ))}
      </View>
      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Horizontal bars for a breakdown, each with its label and count. */
export function BreakdownBars({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => (
        <View key={r.label} style={styles.breakRow}>
          <Text style={styles.breakLabel} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.breakTrack}>
            <View style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0, height: '100%', borderRadius: 999, backgroundColor: r.color }} />
          </View>
          <Text style={styles.breakValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rules: { gap: 4, marginTop: -4 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { ...theme.type.caption, color: theme.colors.muted },

  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: theme.spacing(1),
  },
  pagerTitle: { ...theme.type.label, color: theme.colors.text },
  pagerSub: { ...theme.type.caption, color: theme.colors.muted },
  pagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryFaint,
    borderWidth: 1,
    borderColor: theme.colors.primarySoft,
  },
  pagerBtnText: { ...theme.type.label, color: theme.colors.primary },

  chartArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  chartGroup: { flex: 1, alignItems: 'center' },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, width: '100%', justifyContent: 'center' },
  chartBarCol: { flex: 1, maxWidth: 16, alignItems: 'center', justifyContent: 'flex-end' },
  chartValue: { ...theme.type.tiny, fontSize: 10, color: theme.colors.textSoft, marginBottom: 2 },
  chartLabel: { ...theme.type.tiny, color: theme.colors.muted, marginTop: 4 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { ...theme.type.caption, color: theme.colors.textSoft },

  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakLabel: { ...theme.type.caption, color: theme.colors.textSoft, width: 104 },
  breakTrack: { flex: 1, height: 10, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' },
  breakValue: { ...theme.type.label, width: 28, textAlign: 'right', color: theme.colors.text },
});
