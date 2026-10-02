import { useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Max content width. The app is phone-first; this keeps it sane on a monitor. */
export const COLUMN = 520;

/* ------------------------------------------------------------------ layout */

export function Screen({
  children,
  scroll = true,
  padded = true,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: ReactNode;
}) {
  const bottomInset = useBottomInset();
  const body = [
    padded ? styles.screenBodyPadded : styles.screenBody,
    { paddingBottom: theme.spacing(4) + bottomInset },
  ];
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[body, { flex: 1 }]}>{children}</View>
      )}
      {footer ? (
        <View style={[styles.screenFooter, { paddingBottom: theme.spacing(2) + bottomInset }]}>{footer}</View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/**
 * How far the bottom of a screen's content must stay clear of the system navigation bar.
 *
 * Android draws that bar over the app (edge-to-edge), so anything at the very bottom - a last
 * button, a footer - sits underneath it and can't be tapped. Zero inside the bottom tab navigator:
 * the tab bar already clears the bar (UserNavigator adds the inset to it), so its screens end above
 * it and padding them again would only leave dead space.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  const insideTabBar = useContext(BottomTabBarHeightContext) !== undefined;
  return insideTabBar ? 0 : insets.bottom;
}

/** Branded header used on the login/registration screens. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <SafeAreaView edges={['top']} style={styles.authHeader}>
      <View style={styles.authLogo}>
        <Ionicons name="paw" size={30} color={theme.colors.onPrimary} />
      </View>
      <Text style={styles.authTitle}>{title}</Text>
      <Text style={styles.authSubtitle}>{subtitle}</Text>
    </SafeAreaView>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({
  children,
  gap = 1,
  align = 'center',
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: align, gap: theme.spacing(gap) }, style]}>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ text */

export function Caption({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.caption, style]}>{children}</Text>;
}

/* ------------------------------------------------------------------ controls */

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  full = true,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  const isOff = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isOff}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        full && { alignSelf: 'stretch' },
        pressed && !isOff && styles.buttonPressed,
        isOff && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={17} color={v.fg} /> : null}
          <Text style={[styles.buttonLabel, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: theme.colors.primary, fg: theme.colors.onPrimary, border: theme.colors.primary },
  accent: { bg: theme.colors.accent, fg: theme.colors.onPrimary, border: theme.colors.accent },
  danger: { bg: theme.colors.danger, fg: theme.colors.onPrimary, border: theme.colors.danger },
  secondary: { bg: theme.colors.surface, fg: theme.colors.primaryDark, border: theme.colors.borderStrong },
  ghost: { bg: 'transparent', fg: theme.colors.textSoft, border: 'transparent' },
} as const;

export function IconButton({
  icon,
  onPress,
  color = theme.colors.textSoft,
  size = 20,
  badge,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  badge?: number;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.iconButton}>
      <Ionicons name={icon} size={size} color={color} />
      {badge ? (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
  hint,
  error,
  icon,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  multiline?: boolean;
  hint?: string;
  error?: string;
  icon?: IconName;
  autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          Boolean(error) && styles.inputWrapError,
        ]}
      >
        {icon ? <Ionicons name={icon} size={17} color={theme.colors.muted} /> : null}
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          multiline={multiline}
          autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'sentences')}
          autoCorrect={false}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={theme.colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * Shows and accepts the number the way people in the Philippines actually type it - a plain
 * 11-digit local number starting with "09" (e.g. "09171234567"), with no separate country-code
 * chip. `value`/`onChangeText` still carry the "+639XXXXXXXXX" form the backend expects
 * (`^\+639\d{9}$`) - the local/E.164 conversion happens only at this component's edges.
 */
export function PhoneField({
  label = 'Mobile number',
  value,
  onChangeText,
  error,
  hint,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  hint?: string;
}) {
  const local = value.startsWith('+639') ? `0${value.slice(3)}` : '';
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, Boolean(error) && styles.inputWrapError]}>
        <Ionicons name="call-outline" size={17} color={theme.colors.muted} />
        <TextInput
          style={styles.input}
          value={local}
          onChangeText={(t) => {
            const cleaned = t.replace(/\D/g, '').slice(0, 11);
            const national = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
            onChangeText(national ? `+63${national}` : '');
          }}
          placeholder="09171234567"
          placeholderTextColor={theme.colors.muted}
          keyboardType="number-pad"
          maxLength={11}
        />
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Horizontal single-select used for animal type, sex, size, radius, filters. */
export function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label?: string;
  options: { label: string; value: T; icon?: IconName }[];
  value: T | null;
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.choiceWrap}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              style={[styles.choice, active && styles.choiceActive]}
            >
              {o.icon ? (
                <Ionicons
                  name={o.icon}
                  size={15}
                  color={active ? theme.colors.onPrimary : theme.colors.textSoft}
                />
              ) : null}
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** Full-width segmented switch, e.g. Lost | Found. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; color?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              active && { backgroundColor: o.color ?? theme.colors.primary },
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Dropdown-style picker rendered as a bottom sheet (works on web and native). */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  hint,
  icon = 'location-outline',
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  icon?: IconName;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.inputWrap} onPress={() => setOpen(true)}>
        <Ionicons name={icon} size={17} color={theme.colors.muted} />
        <Text style={[styles.input, !value && { color: theme.colors.muted }]}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={17} color={theme.colors.muted} />
      </Pressable>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}

      {/* No scroll area of its own: the Sheet already scrolls, and two nested vertical scrollers
          fight over the gesture on Android. */}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <View>
          {options.map((o) => (
            <Pressable
              key={o}
              style={styles.selectRow}
              onPress={() => {
                onChange(o);
                setOpen(false);
              }}
            >
              <Text style={[styles.selectRowText, o === value && styles.selectRowTextActive]}>{o}</Text>
              {o === value ? (
                <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    // Translucent so the dialog is laid out the same way on every Android version - under the status
    // and navigation bars - rather than depending on the OS default; the SafeAreaProvider inside
    // then measures the bars from the dialog's own window, which the app-level provider can't do
    // (a Modal is a separate native window, so the inset it reports there is not the dialog's).
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider>
        <SheetBody title={title} onClose={onClose}>
          {children}
        </SheetBody>
      </SafeAreaProvider>
    </Modal>
  );
}

function SheetBody({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <KeyboardAvoidingView style={styles.sheetRoot} behavior="padding">
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      {/* Capped height + its own scroll: a tall form (add animal, edit profile) would otherwise
          grow past the screen and push its last button out of reach. The bottom padding clears the
          system navigation bar, which would otherwise sit on top of that button. */}
      <View style={[styles.sheet, { maxHeight: height * 0.92, paddingBottom: theme.spacing(2) + insets.bottom }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <IconButton icon="close" onPress={onClose} />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: theme.spacing(1) }}
        >
          {children}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ display */

export function Badge({
  label,
  color = theme.colors.primary,
  soft = theme.colors.primarySoft,
  icon,
}: {
  label: string;
  color?: string;
  soft?: string;
  icon?: IconName;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: soft }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, color = theme.colors.primary, size = 40 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

/**
 * Animal photo with a graceful fallback. Seed photos are fetched from the
 * network; if that fails (offline demo, blocked host) a tinted paw tile is shown
 * instead so the layout never collapses.
 */
export function AnimalPhoto({
  uri,
  size = 72,
  radius = theme.radius.md,
  tint = theme.colors.primarySoft,
  iconColor = theme.colors.primary,
}: {
  uri?: string;
  size?: number | 'full';
  radius?: number;
  tint?: string;
  iconColor?: string;
}) {
  const [failed, setFailed] = useState(false);
  const box: ImageStyle =
    size === 'full'
      ? { width: '100%', height: 170, borderRadius: radius }
      : { width: size, height: size, borderRadius: radius };

  if (!uri || failed) {
    return (
      <View style={[box, styles.photoFallback, { backgroundColor: tint }]}>
        <Ionicons name="paw" size={size === 'full' ? 34 : Math.max(16, (size as number) * 0.4)} color={iconColor} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[box, { backgroundColor: tint }]}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={theme.colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action ? <Button label={action} onPress={onAction} variant="secondary" full={false} style={{ marginTop: theme.spacing(1.5) }} /> : null}
    </View>
  );
}

export function ListRow({
  icon,
  iconColor = theme.colors.primary,
  iconSoft = theme.colors.primarySoft,
  title,
  subtitle,
  right,
  onPress,
  badge,
}: {
  icon: IconName;
  iconColor?: string;
  iconSoft?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && onPress && styles.cardPressed]}
    >
      <View style={[styles.listIcon, { backgroundColor: iconSoft }]}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{badge}</Text>
        </View>
      ) : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={theme.colors.muted} /> : null)}
    </Pressable>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

/**
 * Confidence meter.
 *
 * `tone="match"` reads a high score as good (image-recognition candidates);
 * `tone="risk"` reads a high score as bad (moderation flags), so the colour
 * never tells the developer that a 91%-confidence false report is fine.
 */
export function ScoreBar({ score, tone = 'match' }: { score: number; tone?: 'match' | 'risk' }) {
  const pct = Math.round(score * 100);
  const color =
    tone === 'risk'
      ? score >= 0.8
        ? theme.colors.danger
        : score >= 0.55
          ? theme.colors.accent
          : theme.colors.muted
      : score >= 0.8
        ? theme.colors.primary
        : score >= 0.55
          ? theme.colors.accent
          : theme.colors.muted;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.scoreLabel, { color }]}>{pct}% confidence</Text>
    </View>
  );
}

export function Banner({
  tone = 'info',
  icon = 'information-circle',
  title,
  message,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  icon?: IconName;
  title: string;
  message: string;
}) {
  const tones = {
    info: { bg: theme.colors.infoSoft, fg: theme.colors.info },
    success: { bg: theme.colors.primarySoft, fg: theme.colors.primaryDark },
    warning: { bg: theme.colors.accentSoft, fg: theme.colors.accent },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
  } as const;
  const t = tones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Ionicons name={icon} size={19} color={t.fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: t.fg }]}>{title}</Text>
        <Text style={styles.bannerMessage}>{message}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  // Phone-width column, so screens stay readable in a desktop browser.
  screenBody: { paddingBottom: theme.spacing(4), width: '100%', maxWidth: COLUMN, alignSelf: 'center' },
  screenBodyPadded: {
    padding: theme.spacing(2),
    paddingBottom: theme.spacing(4),
    gap: theme.spacing(1.5),
    width: '100%',
    maxWidth: COLUMN,
    alignSelf: 'center',
  },
  screenFooter: {
    padding: theme.spacing(2),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },

  authHeader: {
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: theme.spacing(3),
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
    borderBottomLeftRadius: theme.radius.xl,
    borderBottomRightRadius: theme.radius.xl,
    alignItems: 'center',
  },
  authLogo: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing(1.5),
  },
  authTitle: { ...theme.type.hero, color: theme.colors.onPrimary },
  authSubtitle: {
    marginTop: 6,
    ...theme.type.body,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing(1),
  },
  sectionTitle: { ...theme.type.h2, color: theme.colors.text },
  sectionAction: { ...theme.type.label, color: theme.colors.primary },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing(2),
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing(1),
    ...theme.shadow.card,
  },
  cardPressed: { opacity: 0.7 },

  caption: { ...theme.type.caption, color: theme.colors.muted },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: theme.spacing(2.5),
    borderRadius: theme.radius.md,
    borderWidth: 1,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...theme.type.bodyMedium, fontFamily: theme.fonts.bold },

  iconButton: { padding: 4 },
  iconBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeText: { color: '#fff', fontFamily: theme.fonts.bold, fontSize: 9 },

  field: { gap: 6 },
  fieldLabel: { ...theme.type.label, color: theme.colors.textSoft },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(1.5),
    minHeight: 46,
  },
  inputWrapMultiline: { alignItems: 'flex-start', paddingVertical: theme.spacing(1.25) },
  inputWrapError: { borderColor: theme.colors.danger },
  // outlineWidth: 0 drops the browser focus ring on web; the field already
  // signals focus through its own border. No-op on native.
  input: { flex: 1, ...theme.type.body, color: theme.colors.text, paddingVertical: 10, outlineWidth: 0 },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: 0 },
  fieldHint: { ...theme.type.caption, color: theme.colors.muted },
  fieldError: { ...theme.type.captionMedium, color: theme.colors.danger },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: theme.spacing(1.5),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  choiceActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  choiceText: { ...theme.type.label, color: theme.colors.textSoft },
  choiceTextActive: { color: theme.colors.onPrimary },

  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: theme.radius.sm, alignItems: 'center' },
  segmentText: { ...theme.type.label, color: theme.colors.muted, textAlign: 'center' },
  segmentTextActive: { color: theme.colors.onPrimary },

  sheetRoot: { flex: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing(2),
    gap: theme.spacing(1),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginBottom: theme.spacing(1),
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...theme.type.h2, color: theme.colors.text },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  selectRowText: { ...theme.type.body, color: theme.colors.textSoft },
  selectRowTextActive: { color: theme.colors.primary, fontFamily: theme.fonts.bold },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.radius.pill,
  },
  badgeText: { ...theme.type.tiny },


  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontFamily: theme.fonts.bold },

  photoFallback: { alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: theme.spacing(5), gap: 6 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { ...theme.type.h3, color: theme.colors.text },
  emptyMessage: {
    ...theme.type.body,
    color: theme.colors.muted,
    textAlign: 'center',
    paddingHorizontal: theme.spacing(3),
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing(1.5),
  },
  listIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  listTitle: { ...theme.type.bodyMedium, color: theme.colors.text },
  listSubtitle: { ...theme.type.caption, color: theme.colors.muted, marginTop: 2 },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { color: '#fff', ...theme.type.tiny },

  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2), paddingVertical: 5 },
  kvLabel: { ...theme.type.caption, fontSize: 13, color: theme.colors.muted },
  kvValue: { ...theme.type.label, color: theme.colors.text, flexShrink: 1, textAlign: 'right' },

  scoreTrack: { height: 7, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' },
  scoreFill: { height: 7, borderRadius: 4 },
  scoreLabel: { ...theme.type.tiny },

  banner: {
    flexDirection: 'row',
    gap: theme.spacing(1.25),
    padding: theme.spacing(1.5),
    borderRadius: theme.radius.md,
  },
  bannerTitle: { ...theme.type.label },
  bannerMessage: { ...theme.type.caption, color: theme.colors.textSoft, marginTop: 2 },
});
