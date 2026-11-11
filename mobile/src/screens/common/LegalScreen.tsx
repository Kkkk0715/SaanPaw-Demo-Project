import { Linking, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PRIVACY_POLICY, TERMS_OF_USE, legalInline } from '@saanpaw/shared';
import { theme, fonts } from '@/constants/theme';
import { Card, Screen } from '@/components/ui';

/** One paragraph or list item, with its **bold** labels and tappable links. */
function Inline({ text, style }: { text: string; style?: object }) {
  return (
    <Text style={[styles.body, style]}>
      {legalInline(text).map((part, i) =>
        part.href ? (
          <Text key={i} style={styles.link} onPress={() => void Linking.openURL(part.href!)}>
            {part.text}
          </Text>
        ) : (
          <Text key={i} style={part.bold ? styles.bold : undefined}>
            {part.text}
          </Text>
        ),
      )}
    </Text>
  );
}

/**
 * Terms of Use or Privacy Policy (route param `doc`), opened from the links at the bottom of the
 * first screen. Same wording as the Developer Console - both read it from @saanpaw/shared.
 * Tables are shown as one small card per row, since a phone is too narrow for columns.
 */
export function LegalScreen({ navigation, route }: NativeStackScreenProps<any>) {
  const isPrivacy = route.params?.doc === 'privacy';
  const doc = isPrivacy ? PRIVACY_POLICY : TERMS_OF_USE;

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.effective}>Effective date: {doc.effective}</Text>
      </View>

      {doc.sections.map((s) => (
        <Card key={s.title}>
          <Text style={styles.heading}>{s.title}</Text>
          {s.blocks.map((b, i) =>
            b.type === 'p' ? (
              <Inline key={i} text={b.text} />
            ) : b.type === 'ul' ? (
              <View key={i} style={{ gap: 6 }}>
                {b.items.map((item, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bullet}>{'\u2022'}</Text>
                    <Inline text={item} style={{ flex: 1 }} />
                  </View>
                ))}
              </View>
            ) : (
              <View key={i} style={{ gap: 8 }}>
                {b.rows.map((row, r) => (
                  <View key={r} style={styles.tableRow}>
                    <Text style={styles.tableTitle}>{row[0]}</Text>
                    {row.slice(1).map((cell, c) => (
                      <Text key={c} style={styles.body}>
                        <Text style={styles.bold}>{b.head[c + 1]}: </Text>
                        {cell}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ),
          )}
        </Card>
      ))}

      <Text
        style={[styles.link, { textAlign: 'center' }]}
        onPress={() => navigation.replace('Legal', { doc: isPrivacy ? 'terms' : 'privacy' })}
      >
        Read the {isPrivacy ? 'Terms of Use' : 'Privacy Policy'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...theme.type.h1, color: theme.colors.text },
  effective: { ...theme.type.caption, color: theme.colors.muted },
  heading: { ...theme.type.h2, color: theme.colors.primaryDark },
  body: { ...theme.type.body, color: theme.colors.textSoft },
  bold: { fontFamily: fonts.bold, color: theme.colors.text },
  link: { ...theme.type.body, fontFamily: fonts.bold, color: theme.colors.primary, textDecorationLine: 'underline' },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bullet: { ...theme.type.body, color: theme.colors.primary },
  tableRow: {
    gap: 2,
    padding: theme.spacing(1.25),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  tableTitle: { ...theme.type.h3, color: theme.colors.text },
});
