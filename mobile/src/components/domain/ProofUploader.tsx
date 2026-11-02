import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { uploadProofDocument } from '@saanpaw/shared';
import { theme } from '@/constants/theme';
import { Button, Row } from '@/components/ui';
import { API_BASE_URL } from '@/services/api';
import { shrinkPhoto } from '@/services/photo';

export interface ProofFile {
  key: string;
  name: string;
  kind: 'pdf' | 'photo';
  status: 'uploading' | 'done' | 'failed';
  /** Set once uploaded: the id the application lists in proofDocumentIds. */
  id?: string;
  error?: string;
}

const MAX_FILES = 10;
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Proof of credentials for a shelter application: the LGU permit, business registration, an ID,
 * photos of the facility. Each file uploads as soon as it is picked, so a slow connection shows
 * progress per file instead of one long wait on Submit. Photos and PDFs, up to 8 MB each.
 */
export function ProofUploader({
  files,
  onChange,
  error,
}: {
  files: ProofFile[];
  onChange: (update: (prev: ProofFile[]) => ProofFile[]) => void;
  error?: string;
}) {
  const [pickError, setPickError] = useState<string | null>(null);

  const upload = async (file: { uri: string; name: string; type: string; webFile?: Blob }, kind: ProofFile['kind']) => {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onChange((prev) => [...prev, { key, name: file.name, kind, status: 'uploading' }]);
    try {
      let payload: { uri: string; name: string; type: string } | Blob = { uri: file.uri, name: file.name, type: file.type };
      if (Platform.OS === 'web') payload = file.webFile ?? (await (await fetch(file.uri)).blob());
      const saved = await uploadProofDocument(API_BASE_URL, payload, file.name);
      onChange((prev) => prev.map((f) => (f.key === key ? { ...f, status: 'done', id: saved.id } : f)));
    } catch (e) {
      onChange((prev) =>
        prev.map((f) => (f.key === key ? { ...f, status: 'failed', error: e instanceof Error ? e.message : 'Upload failed' } : f)),
      );
    }
  };

  const roomLeft = () => {
    if (files.length >= MAX_FILES) {
      setPickError(`You can attach up to ${MAX_FILES} files.`);
      return false;
    }
    setPickError(null);
    return true;
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    if (!roomLeft()) return;
    const perm =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPickError('Permission denied. Allow camera or photo access to attach a photo.');
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const uri = await shrinkPhoto(asset.uri, asset.width);
    const base = (asset.fileName ?? 'photo').replace(/\.[a-z0-9]+$/i, '');
    await upload({ uri, name: `${base}.jpg`, type: 'image/jpeg' }, 'photo');
  };

  const addPdf = async () => {
    if (!roomLeft()) return;
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    if (asset.size && asset.size > MAX_BYTES) {
      setPickError(`${asset.name} is larger than 8 MB. Attach a smaller file.`);
      return;
    }
    await upload({ uri: asset.uri, name: asset.name, type: 'application/pdf', webFile: asset.file }, 'pdf');
  };

  const remove = (key: string) => onChange((prev) => prev.filter((f) => f.key !== key));

  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={styles.label}>Proof of credentials</Text>
      <Text style={styles.hint}>
        Attach your LGU permit or accreditation, business registration, a valid ID, and photos of your facility.
        PDF or photos, up to 8 MB each. Only the SaanPaw Developer can see these.
      </Text>

      {files.map((f) => (
        <View key={f.key} style={[styles.file, f.status === 'failed' && { borderColor: theme.colors.danger }]}>
          <View style={styles.fileIcon}>
            <Ionicons name={f.kind === 'pdf' ? 'document-text' : 'image'} size={17} color={theme.colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fileName} numberOfLines={1}>
              {f.name}
            </Text>
            <Text style={[styles.fileStatus, f.status === 'failed' && { color: theme.colors.danger }]}>
              {f.status === 'uploading' ? 'Uploading…' : f.status === 'done' ? 'Uploaded' : f.error ?? 'Upload failed'}
            </Text>
          </View>
          {f.status === 'uploading' ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Pressable onPress={() => remove(f.key)} hitSlop={8} accessibilityLabel={`Remove ${f.name}`}>
              <Ionicons name="close-circle" size={20} color={theme.colors.muted} />
            </Pressable>
          )}
        </View>
      ))}

      <Row gap={1} style={{ flexWrap: 'wrap' }}>
        <Button label="Add PDF" icon="document-attach-outline" variant="secondary" full={false} onPress={() => void addPdf()} />
        <Button label="Add photo" icon="image-outline" variant="secondary" full={false} onPress={() => void addPhoto('library')} />
        {Platform.OS === 'web' ? null : (
          <Button label="Camera" icon="camera-outline" variant="secondary" full={false} onPress={() => void addPhoto('camera')} />
        )}
      </Row>
      {pickError || error ? <Text style={styles.error}>{pickError ?? error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...theme.type.label, color: theme.colors.text },
  hint: { ...theme.type.caption, color: theme.colors.muted },
  error: { ...theme.type.captionMedium, color: theme.colors.danger },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  fileIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: { ...theme.type.bodyMedium, color: theme.colors.text },
  fileStatus: { ...theme.type.caption, color: theme.colors.muted },
});
