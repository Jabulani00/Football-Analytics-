import { Image } from 'expo-image';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { countryCodeForName } from '@/services/oddAlerts';
import { flagFromCode } from '@/utils/countryFlags';

type CountryFlagProps = {
  /** ISO code from the API, e.g. `MX`, `GB-ENG`. */
  code?: string | null;
  /** Country name, used for the emoji fallback when no code is available. */
  name?: string | null;
  /** Rendered height in px (width follows the 4:3 flag ratio). */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Resolves the flagcdn slug for an API country code. Two-letter ISO codes and
 * the GB sub-nations (`GB-ENG` → `gb-eng`) are all supported by flagcdn.
 */
function flagcdnSlug(code: string | null | undefined): string | null {
  if (!code) return null;
  const lower = code.toLowerCase();
  if (/^[a-z]{2}$/.test(lower)) return lower;
  if (/^gb-(eng|sct|wls|nir)$/.test(lower)) return lower;
  return null;
}

/**
 * Country flag as an image (works on every platform, unlike emoji flags which
 * don't render on Windows). Falls back to an emoji/globe when there's no code.
 */
export default function CountryFlag({ code, name, size = 14, style }: CountryFlagProps) {
  const slug = flagcdnSlug(code ?? countryCodeForName(name));
  if (slug) {
    return (
      <Image
        source={{ uri: `https://flagcdn.com/h40/${slug}.png` }}
        style={[{ width: Math.round(size * 1.34), height: size }, style] as never}
        contentFit="contain"
        transition={120}
        accessibilityLabel={name ? `${name} flag` : 'flag'}
      />
    );
  }
  return <Text style={[styles.emoji, { fontSize: size + 4 }]}>{flagFromCode(code, name)}</Text>;
}

const styles = StyleSheet.create({
  emoji: { lineHeight: undefined },
});
