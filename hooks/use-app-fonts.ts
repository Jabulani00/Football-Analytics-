import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';
import { Oswald_400Regular, Oswald_600SemiBold, Oswald_700Bold, useFonts } from '@expo-google-fonts/oswald';

export function useAppFonts() {
  return useFonts({
    Oswald_400Regular,
    Oswald_600SemiBold,
    Oswald_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
}
