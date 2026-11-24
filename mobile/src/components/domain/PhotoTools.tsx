import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { theme } from '@/constants/theme';
import { Button, Caption, Row, Sheet } from '@/components/ui';

/** What the AI read from a photo, one entry per animal in it. */
export interface DescribedAnimal {
  animalType: 'dog' | 'cat' | 'other';
  breed: string | null;
  color: string | null;
  size: 'small' | 'medium' | 'large' | null;
  sex: 'male' | 'female' | 'unknown';
  distinctMarks: string | null;
  position: string | null;
  description: string;
  tags: string[];
}

export const summarizeAnimal = (a: DescribedAnimal) =>
  [a.color, a.breed || a.animalType, a.size].filter(Boolean).join(' · ');

/** Full-screen "please wait" with a message, for AI reading a photo or a report being sent. */
export function LoadingOverlay({ visible, message }: { visible: boolean; message: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.overlayCard}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.overlayText}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

/**
 * "Which animal are you reporting?" when the photo shows more than one pet. Each choice shows what
 * the AI saw and where it is in the photo.
 */
export function AnimalChooser({
  open,
  animals,
  photoUri,
  onChoose,
  onClose,
}: {
  open: boolean;
  animals: DescribedAnimal[];
  photoUri?: string;
  onChoose: (a: DescribedAnimal) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Which animal are you reporting?">
      <View style={{ gap: theme.spacing(1.25) }}>
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.chooserPhoto} resizeMode="cover" /> : null}
        <Caption>The photo shows {animals.length} animals. Pick the one this report is about; its details will be filled in for you to check.</Caption>
        {animals.map((a, i) => (
          <Pressable key={i} style={styles.choice} onPress={() => onChoose(a)} accessibilityRole="button">
            <View style={styles.choiceNum}>
              <Text style={styles.choiceNumText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>{summarizeAnimal(a) || a.animalType}</Text>
              <Caption>{[a.position ? `On the ${a.position}` : null, a.distinctMarks].filter(Boolean).join(' · ') || a.description}</Caption>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
          </Pressable>
        ))}
        <Button label="None of these - fill in myself" variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/**
 * Edits a photo before it is sent: rotate, flip, and crop (square, or the middle part to cut out
 * the background of a scanned poster). Every change is applied to a copy on the phone.
 */
export function PhotoEditor({
  uri,
  onDone,
  onRemove,
  onClose,
}: {
  uri: string | null;
  onDone: (newUri: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = current ?? uri;

  const apply = async (actions: ImageManipulator.Action[] | ((w: number, h: number) => ImageManipulator.Action[])) => {
    if (!shown) return;
    setBusy(true);
    try {
      const list =
        typeof actions === 'function'
          ? await new Promise<ImageManipulator.Action[]>((resolve, reject) =>
              Image.getSize(shown, (w, h) => resolve(actions(w, h)), reject),
            )
          : actions;
      const out = await ImageManipulator.manipulateAsync(shown, list, { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
      setCurrent(out.uri);
    } catch {
      /* keep the photo as it was */
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setCurrent(null);
    onClose();
  };

  return (
    <Sheet open={Boolean(uri)} onClose={close} title="Edit photo">
      <View style={{ gap: theme.spacing(1.25) }}>
        <View style={styles.editorFrame}>
          {shown ? <Image source={{ uri: shown }} style={styles.editorImage} resizeMode="contain" /> : null}
          {busy ? (
            <View style={styles.editorBusy}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
        <Row gap={1} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Tool icon="refresh-outline" label="Rotate" onPress={() => void apply([{ rotate: 90 }])} mirrored />
          <Tool icon="swap-horizontal-outline" label="Flip" onPress={() => void apply([{ flip: ImageManipulator.FlipType.Horizontal }])} />
          <Tool
            icon="crop-outline"
            label="Square"
            onPress={() =>
              void apply((w, h) => {
                const side = Math.min(w, h);
                return [{ crop: { originX: (w - side) / 2, originY: (h - side) / 2, width: side, height: side } }];
              })
            }
          />
          <Tool
            icon="scan-outline"
            label="Trim edges"
            onPress={() =>
              void apply((w, h) => [{ crop: { originX: w * 0.1, originY: h * 0.1, width: w * 0.8, height: h * 0.8 } }])
            }
          />
          <Tool icon="arrow-undo-outline" label="Undo all" onPress={() => setCurrent(null)} />
        </Row>
        <Caption>Tip: when choosing or taking a photo you can also drag the frame to crop exactly.</Caption>
        <Button
          label="Use this photo"
          icon="checkmark-outline"
          disabled={busy}
          onPress={() => {
            if (current) onDone(current);
            close();
          }}
        />
        <Button
          label="Remove photo"
          variant="ghost"
          icon="trash-outline"
          onPress={() => {
            onRemove();
            close();
          }}
        />
      </View>
    </Sheet>
  );
}

function Tool({ icon, label, onPress, mirrored }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; mirrored?: boolean }) {
  return (
    <Pressable style={styles.tool} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={theme.colors.primary} style={mirrored ? { transform: [{ scaleX: -1 }] } : undefined} />
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  overlayCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 14,
    maxWidth: 320,
  },
  overlayText: { ...theme.type.body, color: theme.colors.text, textAlign: 'center' },
  chooserPhoto: { width: '100%', height: 180, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  choiceNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  choiceNumText: { fontWeight: '700', color: theme.colors.primary },
  choiceTitle: { ...theme.type.label, color: theme.colors.text, textTransform: 'capitalize' },
  editorFrame: { width: '100%', height: 280, borderRadius: 12, backgroundColor: '#111', overflow: 'hidden', justifyContent: 'center' },
  editorImage: { width: '100%', height: '100%' },
  editorBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  tool: { alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: theme.colors.primarySoft, minWidth: 64 },
  toolText: { fontSize: 11.5, color: theme.colors.primary, fontWeight: '600' },
});
