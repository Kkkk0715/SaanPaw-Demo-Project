import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/constants/theme';
import { MIN_USER_AGE } from '@saanpaw/shared';
import { ErrorText, Select } from '@/components/ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const daysIn = (month: number, year: number | null) => new Date(Date.UTC(year ?? 2000, month, 0)).getUTCDate();

/**
 * Birthday as three pickers (month, day, year) - no typing, so no date format to get wrong and no
 * extra native date-picker package. Reports "YYYY-MM-DD" once all three are chosen, otherwise null.
 * The year list stops at the year someone turning 18 this year was born; the exact 18+ check
 * (down to the day) is done on submit and again by the server.
 */
export function BirthdayField({
  onChange,
  error,
}: {
  onChange: (birthDate: string | null) => void;
  error?: string;
}) {
  const [month, setMonth] = useState<number | null>(null); // 1-12
  const [day, setDay] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);

  const latestYear = new Date().getFullYear() - MIN_USER_AGE;
  const years = Array.from({ length: 100 }, (_, i) => String(latestYear - i));
  const maxDay = month ? daysIn(month, year) : 31;
  const days = Array.from({ length: maxDay }, (_, i) => String(i + 1));

  // Picking February after day 31 (or a non-leap year after 29 Feb) clears the day that no longer exists.
  useEffect(() => {
    if (day && day > maxDay) setDay(null);
  }, [day, maxDay]);

  useEffect(() => {
    if (month && day && year && day <= maxDay) {
      onChange(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    } else {
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day, year, maxDay]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Birthday</Text>
      <View style={styles.row}>
        <View style={{ flex: 1.4 }}>
          <Select
            label="Month"
            value={month ? MONTHS[month - 1] : null}
            options={MONTHS}
            onChange={(v) => setMonth(MONTHS.indexOf(v) + 1)}
            placeholder="Month"
            icon="calendar-outline"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Select
            label="Day"
            value={day ? String(day) : null}
            options={days}
            onChange={(v) => setDay(Number(v))}
            placeholder="Day"
            icon="today-outline"
          />
        </View>
        <View style={{ flex: 1.15 }}>
          <Select
            label="Year"
            value={year ? String(year) : null}
            options={years}
            onChange={(v) => setYear(Number(v))}
            placeholder="Year"
            icon="calendar-number-outline"
          />
        </View>
      </View>
      {error ? (
        <ErrorText error={error} />
      ) : (
        <Text style={styles.hint}>You must be at least {MIN_USER_AGE} years old to create an account.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { ...theme.type.label, color: theme.colors.text },
  row: { flexDirection: 'row', gap: theme.spacing(1) },
  hint: { ...theme.type.caption, color: theme.colors.muted },
});
